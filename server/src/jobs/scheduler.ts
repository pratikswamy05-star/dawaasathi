/**
 * Dose Guardian background job (every 30 s):
 *   1. create today's dose rows
 *   2. walk every pending dose through the escalation ladder
 *   3. raise refill alerts
 *   4. refresh risk scores
 */
import { checkStreakMilestone } from '../services/streak';
import { checkWhatsAppMisses } from '../services/whatsapp';
import { now } from '../clock';
import { config } from '../config';
import { q } from '../db';
import { nextEscalation, type EscalationAction } from '../domain/escalation';
import { fmt12, hhmmOf, localDate } from '../domain/time';
import { recipientUserIds } from '../services/access';
import { createAlert, notifyUsers } from '../services/alerts';
import { DOSE_SELECT, ensureDoseLogs, escalateMissed, patientName } from '../services/doses';
import { refillPredictions, riskFor } from '../services/overview';

const REMINDER_TITLE: Record<Exclude<EscalationAction, 'missed'>, string> = {
  due: 'Medicine time',
  reminder1: 'Reminder: medicine time',
  reminder2: 'Second reminder: medicine time',
};

let running = false;

export async function tickOnce() {
  if (running) return;
  running = true;
  try {
    const n = now();
    const today = localDate(n);
    await ensureDoseLogs(today);

    const pending = await q(`${DOSE_SELECT} where d.status = 'pending' and d.scheduled_at <= $1 order by d.scheduled_at`, [n.toISOString()]);
    for (const d of pending) {
      const r = nextEscalation(
        { status: d.status, scheduledAt: new Date(d.scheduled_at), reminderCount: d.reminder_count, escalationLevel: d.escalation_level },
        n,
        config.escalation,
      );
      if (!r.action) continue;
      await q(
        `update dose_logs set status = $2, reminder_count = $3, escalation_level = $4,
                method = case when $2 = 'missed' then 'auto' else method end, updated_at = now()
         where id = $1 and status = 'pending'`,
        [d.id, r.status, r.reminderCount, r.escalationLevel],
      );
      if (r.action === 'missed') {
        await escalateMissed(d as never);
      } else {
        const when = fmt12(hhmmOf(new Date(d.scheduled_at)));
        await notifyUsers(await recipientUserIds(Number(d.patient_id), 'patient'), {
          type: 'reminder',
          title: REMINDER_TITLE[r.action],
          body: `${d.medication_name}${d.dosage ? ` ${d.dosage}` : ''} — ${when}`,
          doseLogId: Number(d.id),
        });
      }
    }

    // Refill alerts (once per prescription per day per role)
    const patients = await q('select id from patients');
    for (const p of patients) {
      const pid = Number(p.id);
      const name = await patientName(pid);
      for (const r of await refillPredictions(pid)) {
        if (r.status === 'safe') continue;
        const msg =
          r.status === 'critical'
            ? `${name}: ${r.medicationName} may run out in about ${r.daysLeft} day(s). Please arrange a refill.`
            : `${name}: ${r.medicationName} has about ${r.daysLeft} days left. Refill recommended before ${r.refillBy}.`;
        for (const role of ['caregiver', 'asha'] as const) {
          await createAlert({
            patientId: pid,
            type: 'refill',
            severity: r.status === 'critical' ? 'high' : 'low',
            targetRole: role,
            message: msg,
            prescriptionId: r.prescriptionId,
            dedupeKey: `refill-${r.prescriptionId}-${today}-${r.status}-${role}`,
          });
        }
      }
      await riskFor(pid);
      await checkStreakMilestone(pid);
      await checkWhatsAppMisses(pid);
    }
  } finally {
    running = false;
  }
}

export function startScheduler() {
  const run = () => tickOnce().catch((e) => console.error('[scheduler]', e));
  void run();
  return setInterval(run, 30_000);
}
