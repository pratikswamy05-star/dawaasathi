import { Router, type Request } from 'express';
import { one, q } from '../db';
import { ah, HttpError, idParam } from '../http';
import { requireRole } from '../middleware/auth';
import { accessiblePatientIds, assertPatientAccess } from '../services/access';
import { audit } from '../services/audit';

export const alertsRouter = Router();
export const notificationsRouter = Router();

const STATUSES = ['open', 'acknowledged', 'resolved'];
const TYPES = ['missed_dose', 'repeated_miss', 'refill', 'conflict', 'help', 'vitals', 'teleconsult'];

/** Alerts for every patient the user can see (patients themselves get notifications instead). */
alertsRouter.get(
  '/',
  requireRole('caregiver', 'asha', 'doctor', 'admin'),
  ah(async (req, res) => {
    const ids = await accessiblePatientIds(req.user!);
    if (!ids.length) return res.json({ alerts: [] });
    // ids are integers read from our own database, so inlining them is safe.
    const vals: unknown[] = [];
    const where = [`a.patient_id in (${ids.map((n) => Number(n)).join(',')})`];
    if (typeof req.query.status === 'string' && STATUSES.includes(req.query.status)) {
      vals.push(req.query.status);
      where.push(`a.status = $${vals.length}`);
    }
    if (typeof req.query.type === 'string' && TYPES.includes(req.query.type)) {
      vals.push(req.query.type);
      where.push(`a.type = $${vals.length}`);
    }
    if (req.query.mine === 'true' && req.user!.role !== 'admin') {
      vals.push(req.user!.role);
      where.push(`a.target_role = $${vals.length}`);
    }
    const alerts = await q(
      `select a.*, p.name as patient_name from alerts a join patients p on p.id = a.patient_id
       where ${where.join(' and ')} order by (a.status = 'open') desc, a.created_at desc limit 200`,
      vals,
    );
    res.json({ alerts });
  }),
);

async function setStatus(req: Request, status: 'acknowledged' | 'resolved') {
  const id = idParam(req);
  const a = await one('select id, patient_id from alerts where id = $1', [id]);
  if (!a) throw new HttpError(404, 'Alert not found');
  await assertPatientAccess(req.user!, Number(a.patient_id));
  await q('update alerts set status = $2, acknowledged_by = $3, acknowledged_at = now() where id = $1', [id, status, req.user!.id]);
  await audit(req, `alert_${status}`, 'alert', id);
}

alertsRouter.post(
  '/:id/ack',
  requireRole('caregiver', 'asha', 'doctor', 'admin'),
  ah(async (req, res) => {
    await setStatus(req, 'acknowledged');
    res.json({ ok: true });
  }),
);

alertsRouter.post(
  '/:id/resolve',
  requireRole('caregiver', 'asha', 'doctor', 'admin'),
  ah(async (req, res) => {
    await setStatus(req, 'resolved');
    res.json({ ok: true });
  }),
);

notificationsRouter.get(
  '/',
  ah(async (req, res) => {
    const items = await q(
      'select id, type, title, body, read_at, created_at, alert_id, dose_log_id from notifications where user_id = $1 order by created_at desc limit 50',
      [req.user!.id],
    );
    const unread = await one('select count(*)::int as n from notifications where user_id = $1 and read_at is null', [req.user!.id]);
    res.json({ notifications: items, unread: Number(unread?.n ?? 0) });
  }),
);

notificationsRouter.post(
  '/read-all',
  ah(async (req, res) => {
    await q('update notifications set read_at = now() where user_id = $1 and read_at is null', [req.user!.id]);
    res.json({ ok: true });
  }),
);

notificationsRouter.post(
  '/:id/read',
  ah(async (req, res) => {
    await q('update notifications set read_at = now() where id = $1 and user_id = $2', [idParam(req), req.user!.id]);
    res.json({ ok: true });
  }),
);
