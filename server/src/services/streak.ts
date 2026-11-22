/** Streak data for a patient, and one-time praise messages when a milestone is reached. */
import { one, q } from '../db';
import { computeStreak, type DayCount } from '../domain/streak';
import { addDays, atLocal, localDate } from '../domain/time';
import { recipientUserIds } from './access';
import { notifyUsers } from './alerts';
import { today } from './overview';

export async function streakFor(patientId: number, windowDays = 60) {
  const t = today();
  const from = atLocal(addDays(t, -(windowDays - 1)), '00:00').toISOString();
  const to = atLocal(addDays(t, 1), '00:00').toISOString();
  const rows = await q(`select scheduled_at, status from dose_logs where patient_id = $1 and scheduled_at >= $2 and scheduled_at < $3`, [patientId, from, to]);
  const byDay = new Map<string, DayCount>();
  for (const r of rows) {
    const d = localDate(new Date(r.scheduled_at));
    const e = byDay.get(d) ?? { date: d, taken: 0, missed: 0, pending: 0 };
    if (r.status === 'taken') e.taken++;
    else if (r.status === 'missed') e.missed++;
    else if (r.status === 'pending') e.pending++;
    byDay.set(d, e);
  }
  const days = Array.from({ length: windowDays }, (_, i) => {
    const date = addDays(t, i - windowDays + 1);
    return byDay.get(date) ?? { date, taken: 0, missed: 0, pending: 0 };
  });
  return computeStreak(days);
}

/** Send praise to the family (and the patient and ASHA) the first time a streak reaches a milestone. */
export async function checkStreakMilestone(patientId: number) {
  const s = await streakFor(patientId);
  if (!s.reached || !s.start) return null;
  const done = await one(`select 1 from streak_milestones where patient_id = $1 and days = $2 and streak_start = $3`, [patientId, s.reached, s.start]);
  if (done) return null;
  // Record this and every lower milestone of the same streak, so only the highest one is announced.
  await q(
    `insert into streak_milestones (patient_id, days, streak_start)
     select $1, m, $3::date from unnest($2::int[]) as m on conflict do nothing`,
    [patientId, `{${[3, 7, 14, 30, 60, 90].filter((m) => m <= s.reached!).join(',')}}`, s.start],
  );
  const p = await one('select name from patients where id = $1', [patientId]);
  const family = [...(await recipientUserIds(patientId, 'caregiver')), ...(await recipientUserIds(patientId, 'asha'))];
  await notifyUsers(family, {
    type: 'streak',
    title: `🌟 ${s.reached}-day streak`,
    body: `${p?.name} has taken every medicine on time for ${s.reached} days in a row! A call or a kind word keeps it going.`,
  });
  await notifyUsers(await recipientUserIds(patientId, 'patient'), {
    type: 'streak',
    title: `🌟 ${s.reached} days in a row!`,
    body: `You took every medicine for ${s.reached} days. Your family has been told. Keep going!`,
  });
  return s.reached;
}
