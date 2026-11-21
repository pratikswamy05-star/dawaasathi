/**
 * Missed-dose escalation ladder (pure function; the scheduler job applies the result).
 *
 *   due (0 min)        -> "medicine time" reminder to patient        reminderCount 1
 *   +reminder1Min      -> first reminder                              reminderCount 2
 *   +reminder2Min      -> second reminder                             reminderCount 3
 *   +caregiverMin      -> dose marked missed, caregiver alerted       escalationLevel 3
 *   repeated misses    -> ASHA alert (see isRepeatedMiss)
 *
 * It NEVER tells the patient to take an extra or double dose.
 */
export interface EscalationConfig {
  reminder1Min: number;
  reminder2Min: number;
  caregiverMin: number;
}

export type DoseStatus = 'pending' | 'taken' | 'missed';

export interface DoseState {
  status: DoseStatus;
  scheduledAt: Date;
  reminderCount: number;
  escalationLevel: number;
}

export type EscalationAction = 'due' | 'reminder1' | 'reminder2' | 'missed';

export interface EscalationResult extends DoseState {
  action: EscalationAction | null;
}

export function nextEscalation(d: DoseState, now: Date, cfg: EscalationConfig): EscalationResult {
  const unchanged: EscalationResult = { ...d, action: null };
  if (d.status !== 'pending') return unchanged;
  const late = (now.getTime() - d.scheduledAt.getTime()) / 60000;
  if (late < 0) return unchanged;
  if (late >= cfg.caregiverMin) return { ...d, status: 'missed', escalationLevel: 3, action: 'missed' };
  if (late >= cfg.reminder2Min && d.reminderCount < 3) return { ...d, reminderCount: 3, escalationLevel: 2, action: 'reminder2' };
  if (late >= cfg.reminder1Min && d.reminderCount < 2) return { ...d, reminderCount: 2, escalationLevel: 1, action: 'reminder1' };
  if (d.reminderCount < 1) return { ...d, reminderCount: 1, action: 'due' };
  return unchanged;
}

export const isRepeatedMiss = (missedInWindow: number, threshold: number) => missedInWindow >= threshold;
