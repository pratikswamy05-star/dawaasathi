import { Router } from 'express';
import { now } from '../clock';
import { one, q } from '../db';
import { addDays, atLocal, localDate } from '../domain/time';
import { ah, HttpError } from '../http';
import { requireRole } from '../middleware/auth';
import { accessiblePatientIds } from '../services/access';
import { dosesForDay } from '../services/doses';
import { patientOverview, patientSummary, refillPredictions, today } from '../services/overview';

export const dashboardRouter = Router();

/** Patient home: greeting, progress, next dose, stock, caregiver. */
dashboardRouter.get(
  '/patient',
  requireRole('patient'),
  ah(async (req, res) => {
    const p = await one('select id from patients where user_id = $1', [req.user!.id]);
    if (!p) throw new HttpError(404, 'No patient record is linked to this account');
    const ov = await patientOverview(Number(p.id));
    const nowMs = now().getTime();
    const pending = ov.today.filter((d) => d.status === 'pending');
    // "Next" = the earliest pending dose (overdue first), otherwise nothing left today.
    const next = pending[0] ?? null;
    res.json({
      ...ov,
      serverTime: new Date(nowMs).toISOString(),
      progress: { done: ov.today.filter((d) => d.status === 'taken').length, total: ov.today.length },
      next,
    });
  }),
);

/** Caregiver: every linked patient with today's status and open alerts. */
dashboardRouter.get(
  '/caregiver',
  requireRole('caregiver'),
  ah(async (req, res) => {
    const ids = await accessiblePatientIds(req.user!);
    const patients = await Promise.all(
      ids.map(async (id) => ({
        summary: await patientSummary(id),
        today: await dosesForDay(id, today()),
        refills: await refillPredictions(id),
        alerts: await q(
          `select id, type, severity, message, status, created_at from alerts
           where patient_id = $1 and target_role = 'caregiver' and status <> 'resolved' order by created_at desc limit 20`,
          [id],
        ),
      })),
    );
    res.json({ patients });
  }),
);

async function staffDashboard(ids: number[]) {
  const rows = await Promise.all(ids.map(patientSummary));
  return {
    cards: {
      totalPatients: rows.length,
      atRisk: rows.filter((r) => r.risk.level !== 'low').length,
      highRisk: rows.filter((r) => r.risk.level === 'high').length,
      missedToday: rows.reduce((s, r) => s + r.missedToday, 0),
      refillWarnings: rows.filter((r) => r.refillStatus !== 'safe').length,
      needFollowUp: rows.filter((r) => r.risk.level === 'high' || r.missed7d >= 3).length,
    },
    patients: rows.sort((a, b) => a.risk.score - b.risk.score),
  };
}

dashboardRouter.get(
  '/asha',
  requireRole('asha', 'admin'),
  ah(async (req, res) => {
    const ids = await accessiblePatientIds(req.user!);
    res.json(await staffDashboard(ids));
  }),
);

dashboardRouter.get(
  '/doctor',
  requireRole('doctor', 'admin'),
  ah(async (req, res) => {
    const ids = await accessiblePatientIds(req.user!);
    const base = await staffDashboard(ids);
    const inList = ids.length ? ids.map(Number).join(',') : '0';
    const conflicts = await q(
      `select a.id, a.patient_id, p.name as patient_name, a.message, a.severity, a.status, a.created_at
       from alerts a join patients p on p.id = a.patient_id
       where a.patient_id in (${inList}) and a.type = 'conflict' and a.status <> 'resolved' order by a.created_at desc limit 20`,
    );
    const safety = await q(
      `select a.id, a.patient_id, p.name as patient_name, a.type, a.message, a.severity, a.status, a.created_at
       from alerts a join patients p on p.id = a.patient_id
       where a.patient_id in (${inList}) and a.severity = 'high' and a.status = 'open' order by a.created_at desc limit 20`,
    );
    res.json({ ...base, conflicts, safetyAlerts: safety });
  }),
);

dashboardRouter.get(
  '/admin',
  requireRole('admin'),
  ah(async (_req, res) => {
    const users = await q('select role, count(*)::int as n, count(*) filter (where active)::int as active from users group by role order by role');
    const patients = await one('select count(*)::int as n from patients');
    const from = atLocal(today(), '00:00').toISOString();
    const to = atLocal(addDays(today(), 1), '00:00').toISOString();
    const dosesToday = await q('select status, count(*)::int as n from dose_logs where scheduled_at >= $1 and scheduled_at < $2 group by status', [
      from,
      to,
    ]);
    const alerts = await q(`select type, count(*)::int as n from alerts where status = 'open' group by type`);
    const seriesFrom = atLocal(addDays(today(), -13), '00:00').toISOString();
    // Group by local day in JS (the database may run in UTC).
    const raw = await q('select scheduled_at, status from dose_logs where scheduled_at >= $1 and scheduled_at <= $2', [seriesFrom, now().toISOString()]);
    const byDay = new Map<string, { taken: number; missed: number }>();
    for (const r of raw) {
      const d = localDate(new Date(r.scheduled_at));
      const e = byDay.get(d) ?? { taken: 0, missed: 0 };
      if (r.status === 'taken') e.taken++;
      if (r.status === 'missed') e.missed++;
      byDay.set(d, e);
    }
    const audit = await q(
      `select l.id, l.action, l.entity, l.entity_id, l.created_at, u.name as user_name, u.role as user_role
       from audit_logs l left join users u on u.id = l.user_id order by l.created_at desc limit 15`,
    );
    res.json({
      users,
      patients: Number(patients?.n ?? 0),
      dosesToday,
      openAlerts: alerts,
      series: Array.from({ length: 14 }, (_, i) => {
        const date = addDays(today(), i - 13);
        const e = byDay.get(date) ?? { taken: 0, missed: 0 };
        const done = e.taken + e.missed;
        return { date, taken: e.taken, missed: e.missed, pct: done ? Math.round((e.taken / done) * 100) : null };
      }),
      audit,
    });
  }),
);
