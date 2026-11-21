import { now } from '../clock';
import { json, one, q, type Row } from '../db';
import { detectConflicts, type Conflict, type RxForCheck } from '../domain/conflicts';
import { scheduleTimes, type FoodRule, type Frequency } from '../domain/schedule';
import { localDate } from '../domain/time';
import { createAlert } from './alerts';
import { ensureDoseLogs } from './doses';

export const RX_SELECT = `
  select p.id, p.patient_id, p.medication_id, p.doctor_id, p.prescriber_name, p.source, p.dosage, p.units_per_dose,
         p.frequency, p.times, p.food_rule, p.start_date, p.end_date, p.current_quantity, p.instructions, p.status,
         p.created_at, p.updated_at,
         m.name as medication_name, m.active_ingredients, m.category, m.strength, m.instructions as medication_instructions
  from prescriptions p join medications m on m.id = p.medication_id`;

export const toCheck = (r: Row): RxForCheck => ({
  id: r.id,
  medicationId: Number(r.medication_id),
  medicationName: r.medication_name,
  activeIngredients: r.active_ingredients ?? [],
  dosage: r.dosage,
  frequency: r.frequency,
  times: r.times ?? [],
  foodRule: r.food_rule,
  prescriber: r.prescriber_name,
  startDate: r.start_date,
  endDate: r.end_date,
});

export async function activePrescriptions(patientId: number) {
  return q(`${RX_SELECT} where p.patient_id = $1 and p.status = 'active' order by p.id`, [patientId]);
}

export async function patientConflicts(patientId: number): Promise<Conflict[]> {
  return detectConflicts((await activePrescriptions(patientId)).map(toCheck));
}

/** Replace a prescription's schedule rows and today's still-pending doses. */
export async function regenerateSchedules(prescriptionId: number) {
  const rx = await one('select id, patient_id, frequency, food_rule, times, status from prescriptions where id = $1', [prescriptionId]);
  if (!rx) return;
  const nowIso = now().toISOString();
  await q('update medication_schedules set active = false where prescription_id = $1', [prescriptionId]);
  await q(`delete from dose_logs where prescription_id = $1 and status = 'pending' and scheduled_at > $2`, [prescriptionId, nowIso]);
  if (rx.status !== 'active') return;
  for (const t of scheduleTimes({ frequency: rx.frequency, foodRule: rx.food_rule, times: rx.times ?? [] })) {
    await q('insert into medication_schedules (prescription_id, patient_id, time_of_day, food_rule) values ($1, $2, $3, $4)', [
      prescriptionId,
      rx.patient_id,
      t,
      rx.food_rule,
    ]);
  }
  await ensureDoseLogs(localDate(now()), Number(rx.patient_id));
}

export interface RxInput {
  medicationId: number;
  doctorId?: number | null;
  prescriberName: string;
  source: 'PHC' | 'Health camp' | 'Private' | 'Hospital';
  dosage?: string | null;
  unitsPerDose: number;
  frequency?: Frequency | null;
  times?: string[];
  foodRule: FoodRule;
  startDate: string;
  endDate?: string | null;
  currentQuantity: number;
  instructions?: string | null;
}

export async function createPrescription(patientId: number, input: RxInput, createdBy: number | null) {
  const row = await one(
    `insert into prescriptions (patient_id, medication_id, doctor_id, prescriber_name, source, dosage, units_per_dose, frequency,
                                times, food_rule, start_date, end_date, current_quantity, instructions, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15) returning id`,
    [
      patientId,
      input.medicationId,
      input.doctorId ?? null,
      input.prescriberName,
      input.source,
      input.dosage || null,
      input.unitsPerDose,
      input.frequency ?? null,
      json(input.times ?? []),
      input.foodRule,
      input.startDate,
      input.endDate || null,
      input.currentQuantity,
      input.instructions || null,
      createdBy,
    ],
  );
  const id = Number(row!.id);
  await regenerateSchedules(id);
  await raiseConflictAlerts(patientId);
  return id;
}

/** One doctor alert per distinct conflict (deduplicated). */
export async function raiseConflictAlerts(patientId: number) {
  for (const c of await patientConflicts(patientId)) {
    await createAlert({
      patientId,
      type: 'conflict',
      severity: c.severity === 'warning' ? 'medium' : 'low',
      targetRole: 'doctor',
      message: c.message,
      prescriptionId: Number(c.prescriptionIds[0]) || null,
      dedupeKey: `conflict-${patientId}-${c.type}-${c.prescriptionIds.join('-')}`,
    });
  }
}
