/** Read models used by dashboards and reports: adherence, refill predictions, risk score. */
import { now } from '../clock';
import { config } from '../config';
import { json, one, q } from '../db';
import { predictRefill } from '../domain/refill';
import { computeRisk } from '../domain/riskScore';
import { dosesPerDay } from '../domain/schedule';
import { addDays, atLocal, localDate } from '../domain/time';
import { dosesForDay } from './doses';
import { activePrescriptions, patientConflicts } from './prescriptions';

export const today = () => localDate(now());

export async function adherence(patientId: number, days: number) {
  const from = atLocal(addDays(today(), -(days - 1)), '00:00').toISOString();
  const r = await one(
    `select count(*) filter (where status = 'taken')::int as taken,
            count(*) filter (where status = 'missed')::int as missed,
            count(*) filter (where status = 'pending')::int as pending
     from dose_logs where patient_id = $1 and scheduled_at >= $2 and scheduled_at <= $3`,
    [patientId, from, now().toISOString()],
  );
  const taken = Number(r?.taken ?? 0);
  const missed = Number(r?.missed ?? 0);
  const done = taken + missed;
  return { taken, missed, pending: Number(r?.pending ?? 0), pct: done ? Math.round((taken / done) * 100) : null };
}

/** Daily adherence series for charts. */
export async function dailySeries(patientId: number, days: number) {
  const from = atLocal(addDays(today(), -(days - 1)), '00:00').toISOString();
  const rows = await q(`select scheduled_at, status from dose_logs where patient_id = $1 and scheduled_at >= $2 and scheduled_at <= $3`, [
    patientId,
    from,
    now().toISOString(),
  ]);
  const byDay = new Map<string, { taken: number; missed: number }>();
  for (const r of rows) {
    const d = localDate(new Date(r.scheduled_at));
    const e = byDay.get(d) ?? { taken: 0, missed: 0 };
    if (r.status === 'taken') e.taken++;
    if (r.status === 'missed') e.missed++;
    byDay.set(d, e);
  }
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today(), i - days + 1);
    const e = byDay.get(date) ?? { taken: 0, missed: 0 };
    const done = e.taken + e.missed;
    return { date, taken: e.taken, missed: e.missed, pct: done ? Math.round((e.taken / done) * 100) : null };
  });
}

export async function refillPredictions(patientId: number) {
  const t = today();
  return (await activePrescriptions(patientId)).map((rx) => ({
    prescriptionId: Number(rx.id),
    medicationName: rx.medication_name,
    dosage: rx.dosage,
    unitsPerDose: rx.units_per_dose,
    ...predictRefill(
      {
        currentQuantity: rx.current_quantity,
        unitsPerDose: rx.units_per_dose,
        dosesPerDay: dosesPerDay({ frequency: rx.frequency, foodRule: rx.food_rule, times: rx.times ?? [] }),
        today: t,
        endDate: rx.end_date,
      },
      config.refill,
    ),
  }));
}

export async function openAlertCount(patientId: number) {
  return Number((await one(`select count(*)::int as n from alerts where patient_id = $1 and status = 'open'`, [patientId]))?.n ?? 0);
}

/** Compute the transparent safety score; store a history row only when it changes. */
export async function riskFor(patientId: number) {
  const [adh, refills, conflicts, openAlerts] = await Promise.all([
    adherence(patientId, 7),
    refillPredictions(patientId),
    patientConflicts(patientId),
    openAlertCount(patientId),
  ]);
  const result = computeRisk({
    adherencePct: adh.pct,
    missed7d: adh.missed,
    refillCritical: refills.filter((r) => r.status === 'critical').length,
    refillSoon: refills.filter((r) => r.status === 'soon').length,
    conflicts: conflicts.filter((c) => c.severity === 'warning').length,
    openAlerts,
  });
  const last = await one('select score from patient_risk_scores where patient_id = $1 order by computed_at desc limit 1', [patientId]);
  if (!last || Number(last.score) !== result.score) {
    await q('insert into patient_risk_scores (patient_id, score, level, factors) values ($1, $2, $3, $4::jsonb)', [
      patientId,
      result.score,
      result.level,
      json(result.factors),
    ]);
  }
  return result;
}

export async function patientRow(patientId: number) {
  return one(
    `select p.id, p.name, p.age, p.gender, p.village, p.phone, p.conditions, p.user_id,
            cu.name as caregiver_name, cu.phone as caregiver_phone, c.relation as caregiver_relation,
            au.name as asha_name, au.phone as asha_phone, du.name as doctor_name, d.facility as doctor_facility
     from patients p
     left join caregivers c on c.id = p.caregiver_id left join users cu on cu.id = c.user_id
     left join asha_workers a on a.id = p.asha_id left join users au on au.id = a.user_id
     left join doctors d on d.id = p.doctor_id left join users du on du.id = d.user_id
     where p.id = $1`,
    [patientId],
  );
}

/** Compact row for tables (ASHA / doctor / admin lists). */
export async function patientSummary(patientId: number) {
  const [p, adh7, refills, risk, openAlerts] = await Promise.all([
    patientRow(patientId),
    adherence(patientId, 7),
    refillPredictions(patientId),
    riskFor(patientId),
    openAlertCount(patientId),
  ]);
  const t = await dosesForDay(patientId, today());
  const minDays = refills.reduce<number | null>((m, r) => (r.daysLeft == null ? m : m == null ? r.daysLeft : Math.min(m, r.daysLeft)), null);
  return {
    id: patientId,
    name: p?.name,
    age: p?.age,
    village: p?.village,
    conditions: (p?.conditions ?? []) as string[],
    adherence7d: adh7.pct,
    missed7d: adh7.missed,
    missedToday: t.filter((d) => d.status === 'missed').length,
    takenToday: t.filter((d) => d.status === 'taken').length,
    totalToday: t.length,
    refillDaysLeft: minDays,
    refillStatus: refills.some((r) => r.status === 'critical') ? 'critical' : refills.some((r) => r.status === 'soon') ? 'soon' : 'safe',
    risk,
    openAlerts,
  };
}

/** Everything about one patient, for detail pages. */
export async function patientOverview(patientId: number) {
  const [patient, todayDoses, adh7, adh30, series, refills, conflicts, risk, prescriptions] = await Promise.all([
    patientRow(patientId),
    dosesForDay(patientId, today()),
    adherence(patientId, 7),
    adherence(patientId, 30),
    dailySeries(patientId, 14),
    refillPredictions(patientId),
    patientConflicts(patientId),
    riskFor(patientId),
    activePrescriptions(patientId),
  ]);
  return { patient, today: todayDoses, adherence7d: adh7, adherence30d: adh30, series, refills, conflicts, risk, prescriptions };
}
