import { now } from '../clock';
import { config } from '../config';
import { one, q } from '../db';
import { isRepeatedMiss } from '../domain/escalation';
import { addDays, atLocal, fmt12, hhmmOf, localDate } from '../domain/time';
import { HttpError } from '../http';
import { assertPatientAccess, type AuthUser } from './access';
import { createAlert } from './alerts';
import { checkWhatsAppMisses } from './whatsapp';

/** Create today's dose_logs rows from active schedules (idempotent thanks to the unique key). */
export async function ensureDoseLogs(date: string, patientId?: number) {
  const rows = await q(
    `select s.id, s.patient_id, s.prescription_id, s.time_of_day
     from medication_schedules s join prescriptions p on p.id = s.prescription_id
     where s.active and p.status = 'active' and p.start_date <= $1 and (p.end_date is null or p.end_date >= $1)
       ${patientId ? 'and s.patient_id = $2' : ''}`,
    patientId ? [date, patientId] : [date],
  );
  for (const s of rows) {
    await q(
      `insert into dose_logs (patient_id, prescription_id, schedule_id, scheduled_at)
       values ($1, $2, $3, $4) on conflict (schedule_id, scheduled_at) do nothing`,
      [s.patient_id, s.prescription_id, s.id, atLocal(date, s.time_of_day).toISOString()],
    );
  }
}

export const DOSE_SELECT = `
  select d.id, d.patient_id, d.prescription_id, d.scheduled_at, d.status, d.confirmed_at, d.method, d.reminder_count,
         d.escalation_level, p.dosage, p.units_per_dose, p.food_rule, p.current_quantity, p.instructions,
         m.name as medication_name, m.category, m.instructions as medication_instructions
  from dose_logs d
  join prescriptions p on p.id = d.prescription_id
  join medications m on m.id = p.medication_id`;

export async function dosesForDay(patientId: number, date: string) {
  const from = atLocal(date, '00:00').toISOString();
  const to = atLocal(addDays(date, 1), '00:00').toISOString();
  return q(`${DOSE_SELECT} where d.patient_id = $1 and d.scheduled_at >= $2 and d.scheduled_at < $3 order by d.scheduled_at, m.name`, [
    patientId,
    from,
    to,
  ]);
}

export async function patientName(patientId: number) {
  return (await one('select name from patients where id = $1', [patientId]))?.name ?? 'Patient';
}

/** Missed dose -> caregiver alert; repeated misses -> ASHA alert. Shared by the scheduler and manual "Missed". */
export async function escalateMissed(dose: { id: number; patient_id: number; scheduled_at: Date | string; medication_name: string }) {
  const name = await patientName(dose.patient_id);
  const when = fmt12(hhmmOf(new Date(dose.scheduled_at)));
  await createAlert({
    patientId: dose.patient_id,
    type: 'missed_dose',
    severity: 'medium',
    targetRole: 'caregiver',
    message: `${name} has not taken ${dose.medication_name} (due ${when}). Please check on them. Do not give an extra dose — ask the doctor if unsure.`,
    doseLogId: dose.id,
    dedupeKey: `missed-${dose.id}`,
  });

  const { escalation } = config;
  const since = atLocal(addDays(localDate(now()), -(escalation.repeatWindowDays - 1)), '00:00').toISOString();
  const missed = await one(`select count(*)::int as n from dose_logs where patient_id = $1 and status = 'missed' and scheduled_at >= $2`, [
    dose.patient_id,
    since,
  ]);
  const n = Number(missed?.n ?? 0);
  if (isRepeatedMiss(n, escalation.repeatThreshold)) {
    await createAlert({
      patientId: dose.patient_id,
      type: 'repeated_miss',
      severity: 'high',
      targetRole: 'asha',
      message: `${name} has missed ${n} doses in the last ${escalation.repeatWindowDays} days. A home visit or follow-up is recommended.`,
      dedupeKey: `repeat-${dose.patient_id}-${localDate(now())}`,
    });
  }
  await checkWhatsAppMisses(dose.patient_id);
}

export interface ConfirmInput {
  status: 'taken' | 'missed';
  method: 'button' | 'voice' | 'caregiver' | 'asha';
  confirmedAt?: string;
  clientId?: string;
}

/**
 * Record a dose. Allowed: the patient (own doses), their caregiver, ASHA worker, or admin.
 * Idempotent: replaying the same offline item is harmless.
 */
export async function confirmDose(user: AuthUser, doseId: number, input: ConfirmInput) {
  const dose = await one(`${DOSE_SELECT} where d.id = $1`, [doseId]);
  if (!dose) throw new HttpError(404, 'Dose not found');
  if (user.role === 'doctor') throw new HttpError(403, 'Doctors cannot record doses for patients');
  await assertPatientAccess(user, Number(dose.patient_id));

  if (dose.status === input.status) return { dose, changed: false };

  const nowDate = now();
  let confirmedAt = input.confirmedAt ? new Date(input.confirmedAt) : nowDate;
  if (Number.isNaN(confirmedAt.getTime()) || confirmedAt > nowDate) confirmedAt = nowDate;
  if (input.status === 'taken' && new Date(dose.scheduled_at).getTime() - nowDate.getTime() > 2 * 3600_000)
    throw new HttpError(400, 'This dose is not due yet');

  const method = user.role === 'caregiver' ? 'caregiver' : user.role === 'asha' ? 'asha' : input.method;
  await q(
    `update dose_logs set status = $2, confirmed_at = $3, method = $4, confirmed_by = $5, client_id = coalesce($6, client_id), updated_at = now()
     where id = $1`,
    [doseId, input.status, confirmedAt.toISOString(), method, user.id, input.clientId ?? null],
  );

  // Stock: taking a dose uses tablets; undoing a "taken" (rare) gives them back.
  if (input.status === 'taken') {
    await q('update prescriptions set current_quantity = greatest(0, current_quantity - units_per_dose), updated_at = now() where id = $1', [
      dose.prescription_id,
    ]);
    await q(`update alerts set status = 'resolved' where dose_log_id = $1 and status <> 'resolved'`, [doseId]);
  } else if (dose.status === 'taken') {
    await q('update prescriptions set current_quantity = least(1000, current_quantity + units_per_dose), updated_at = now() where id = $1', [
      dose.prescription_id,
    ]);
  }
  if (input.status === 'missed') await escalateMissed(dose as never);

  return { dose: await one(`${DOSE_SELECT} where d.id = $1`, [doseId]), changed: true };
}
