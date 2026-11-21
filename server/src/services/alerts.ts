import { one, q } from '../db';
import { recipientUserIds } from './access';

export type AlertType = 'missed_dose' | 'repeated_miss' | 'refill' | 'conflict' | 'help' | 'vitals' | 'teleconsult';
export type Severity = 'low' | 'medium' | 'high';
export type TargetRole = 'caregiver' | 'asha' | 'doctor';

export interface NewAlert {
  patientId: number;
  type: AlertType;
  severity: Severity;
  targetRole: TargetRole;
  message: string;
  doseLogId?: number | null;
  prescriptionId?: number | null;
  /** Same key = same alert; prevents duplicates every scheduler tick. */
  dedupeKey?: string | null;
}

const TITLES: Record<AlertType, string> = {
  missed_dose: 'Missed dose',
  repeated_miss: 'Repeated missed doses',
  refill: 'Refill needed',
  conflict: 'Prescription warning',
  help: 'Help requested',
  vitals: 'Health reading needs attention',
  teleconsult: 'Doctor consultation',
};

export async function notifyUsers(
  userIds: number[],
  n: { type: string; title: string; body: string; alertId?: number | null; doseLogId?: number | null },
) {
  for (const uid of userIds) {
    await q('insert into notifications (user_id, alert_id, dose_log_id, type, title, body) values ($1, $2, $3, $4, $5, $6)', [
      uid,
      n.alertId ?? null,
      n.doseLogId ?? null,
      n.type,
      n.title,
      n.body,
    ]);
  }
}

/** Creates the alert (once per dedupe key) and notifies every user in the target role for that patient. */
export async function createAlert(a: NewAlert): Promise<number | null> {
  const row = await one(
    `insert into alerts (patient_id, dose_log_id, prescription_id, type, severity, target_role, message, dedupe_key)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (dedupe_key) do nothing
     returning id`,
    [a.patientId, a.doseLogId ?? null, a.prescriptionId ?? null, a.type, a.severity, a.targetRole, a.message, a.dedupeKey ?? null],
  );
  if (!row) return null;
  const alertId = Number(row.id);
  await notifyUsers(await recipientUserIds(a.patientId, a.targetRole), {
    type: a.type,
    title: TITLES[a.type],
    body: a.message,
    alertId,
  });
  return alertId;
}
