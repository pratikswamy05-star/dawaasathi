import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { one, q } from '../db';
import { ah, HttpError, idParam, parse } from '../http';
import { requireRole } from '../middleware/auth';
import { audit } from '../services/audit';
import { adminUserSchema, adminUserUpdateSchema } from '../validation';

export const adminRouter = Router();
export const staffRouter = Router();
export const medicationsRouter = Router();

adminRouter.use(requireRole('admin'));

adminRouter.get(
  '/users',
  ah(async (req, res) => {
    const role = typeof req.query.role === 'string' ? req.query.role : null;
    const users = await q(
      `select u.id, u.name, u.phone, u.email, u.role, u.language, u.active, u.created_at,
              d.facility, a.area, c.relation
       from users u
       left join doctors d on d.user_id = u.id left join asha_workers a on a.user_id = u.id left join caregivers c on c.user_id = u.id
       where ($1::text is null or u.role = $1) order by u.role, u.name`,
      [role],
    );
    res.json({ users });
  }),
);

adminRouter.post(
  '/users',
  ah(async (req, res) => {
    const b = parse(adminUserSchema, req.body);
    if (await one('select 1 from users where phone = $1', [b.phone])) throw new HttpError(409, 'This mobile number is already registered');
    const u = await one('insert into users (name, phone, email, password_hash, role, language) values ($1, $2, $3, $4, $5, $6) returning id', [
      b.name,
      b.phone,
      b.email || null,
      await bcrypt.hash(b.password, 10),
      b.role,
      b.language,
    ]);
    const id = Number(u!.id);
    if (b.role === 'doctor') await q('insert into doctors (user_id, facility) values ($1, $2)', [id, b.facility ?? null]);
    if (b.role === 'asha') await q('insert into asha_workers (user_id, area) values ($1, $2)', [id, b.area ?? null]);
    if (b.role === 'caregiver') await q('insert into caregivers (user_id, relation) values ($1, $2)', [id, b.relation ?? null]);
    if (b.role === 'patient') await q(`insert into patients (user_id, name, phone) values ($1, $2, $3)`, [id, b.name, b.phone]);
    await audit(req, 'user_create', 'user', id, { role: b.role });
    res.status(201).json({ id });
  }),
);

adminRouter.patch(
  '/users/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const b = parse(adminUserUpdateSchema, req.body);
    if (id === req.user!.id && b.active === false) throw new HttpError(400, 'You cannot deactivate your own account');
    await q('update users set active = coalesce($2, active), name = coalesce($3, name), updated_at = now() where id = $1', [
      id,
      b.active ?? null,
      b.name ?? null,
    ]);
    await audit(req, 'user_update', 'user', id, b);
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/audit-logs',
  ah(async (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const logs = await q(
      `select l.id, l.action, l.entity, l.entity_id, l.details, l.ip, l.created_at, u.name as user_name, u.role as user_role
       from audit_logs l left join users u on u.id = l.user_id order by l.created_at desc limit $1`,
      [limit],
    );
    res.json({ logs });
  }),
);

/** Lists for assignment dropdowns (names only, no sensitive data). */
staffRouter.get(
  '/',
  requireRole('asha', 'doctor', 'admin'),
  ah(async (_req, res) => {
    const [doctors, ashas, caregivers] = await Promise.all([
      q(`select d.id, u.name, d.facility from doctors d join users u on u.id = d.user_id where u.active order by u.name`),
      q(`select a.id, u.name, a.area from asha_workers a join users u on u.id = a.user_id where u.active order by u.name`),
      q(`select c.id, u.name, c.relation from caregivers c join users u on u.id = c.user_id where u.active order by u.name`),
    ]);
    res.json({ doctors, ashas, caregivers });
  }),
);

medicationsRouter.get(
  '/',
  ah(async (_req, res) => {
    res.json({ medications: await q('select id, name, active_ingredients, strength, category, instructions from medications order by category, name') });
  }),
);
