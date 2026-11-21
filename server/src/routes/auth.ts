import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { json, one } from '../db';
import { ah, HttpError, parse } from '../http';
import { requireAuth, signToken } from '../middleware/auth';
import type { AuthUser, Role } from '../services/access';
import { audit } from '../services/audit';
import { loginSchema, registerSchema, updateMeSchema } from '../validation';

export const authRouter = Router();

/** Which roles may sign in through which login screen. */
const PORTAL_ROLES: Record<'patient' | 'caregiver' | 'asha' | 'staff', Role[]> = {
  patient: ['patient'],
  caregiver: ['caregiver'],
  asha: ['asha'],
  staff: ['doctor', 'admin'],
};
const ROLE_NAME: Record<Role, string> = { patient: 'a patient', caregiver: 'a caregiver', asha: 'an ASHA worker', doctor: 'a doctor', admin: 'an admin' };
const PORTAL_FOR: Record<Role, string> = { patient: 'Patient', caregiver: 'Caregiver', asha: 'ASHA worker', doctor: 'Doctor / Admin', admin: 'Doctor / Admin' };
const PORTAL_FOR_KEY: Record<Role, string> = { patient: 'patient', caregiver: 'caregiver', asha: 'asha', doctor: 'staff', admin: 'staff' };

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
});

/** Public profile shape sent to the client (never includes the password hash). */
async function profile(userId: number) {
  const u = await one(
    `select u.id, u.name, u.phone, u.role, u.language, p.id as patient_id
     from users u left join patients p on p.user_id = u.id where u.id = $1`,
    [userId],
  );
  if (!u) throw new HttpError(404, 'User not found');
  return { id: u.id, name: u.name, phone: u.phone, role: u.role, language: u.language, patientId: u.patient_id ?? null };
}

authRouter.post(
  '/login',
  loginLimiter,
  ah(async (req, res) => {
    const body = parse(loginSchema, req.body);
    const u = await one('select id, role, name, password_hash, active from users where phone = $1', [body.phone]);
    const ok = u && (await bcrypt.compare(body.password, u.password_hash));
    if (!u || !ok) {
      await audit(req, 'login_failed', 'user', null, { phone: body.phone.slice(0, 2) + '******' + body.phone.slice(-2) });
      throw new HttpError(401, 'Wrong mobile number or password');
    }
    if (!u.active) throw new HttpError(403, 'This account has been deactivated. Please contact the administrator.');
    if (body.portal && !PORTAL_ROLES[body.portal].includes(u.role)) {
      await audit(req, 'login_wrong_portal', 'user', u.id, { portal: body.portal }, u.id);
      throw new HttpError(403, `This is ${ROLE_NAME[u.role as Role]} account. Please use the ${PORTAL_FOR[u.role as Role]} login.`, { portal: PORTAL_FOR_KEY[u.role as Role] });
    }
    const user: AuthUser = { id: u.id, role: u.role, name: u.name };
    await audit(req, 'login', 'user', u.id, {}, u.id);
    res.json({ token: signToken(user), user: await profile(u.id) });
  }),
);

/** Self-registration is limited to patients and caregivers. Staff accounts are created by an admin. */
authRouter.post(
  '/register',
  loginLimiter,
  ah(async (req, res) => {
    const b = parse(registerSchema, req.body);
    if (await one('select 1 from users where phone = $1', [b.phone])) throw new HttpError(409, 'This mobile number is already registered');
    const hash = await bcrypt.hash(b.password, 10);
    const u = await one('insert into users (name, phone, password_hash, role, language) values ($1, $2, $3, $4, $5) returning id, role, name', [
      b.name,
      b.phone,
      hash,
      b.role,
      b.language,
    ]);
    if (b.role === 'patient') {
      await one('insert into patients (user_id, name, age, village, phone, conditions) values ($1, $2, $3, $4, $5, $6::jsonb) returning id', [
        u!.id,
        b.name,
        b.age ?? null,
        b.village ?? null,
        b.phone,
        json(b.conditions),
      ]);
    } else {
      await one('insert into caregivers (user_id, relation) values ($1, $2) returning id', [u!.id, b.relation ?? null]);
    }
    await audit(req, 'register', 'user', u!.id, { role: b.role }, u!.id);
    res.status(201).json({ token: signToken({ id: u!.id, role: u!.role, name: u!.name }), user: await profile(u!.id) });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    res.json({ user: await profile(req.user!.id) });
  }),
);

authRouter.patch(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const b = parse(updateMeSchema, req.body);
    await one('update users set language = $2, updated_at = now() where id = $1 returning id', [req.user!.id, b.language]);
    res.json({ user: await profile(req.user!.id) });
  }),
);
