/**
 * Adherence streaks: consecutive days on which every scheduled dose was taken.
 * Today counts only once all of today's doses are taken; an unfinished today never breaks the streak.
 */
export interface DayCount {
  date: string; // YYYY-MM-DD (local)
  taken: number;
  missed: number;
  pending: number;
}

export type DayState = 'full' | 'missed' | 'open' | 'none';

export const MILESTONES = [3, 7, 14, 30, 60, 90];

export function dayState(d: DayCount | undefined): DayState {
  if (!d || d.taken + d.missed + d.pending === 0) return 'none';
  if (d.missed > 0) return 'missed';
  if (d.pending > 0) return 'open';
  return 'full';
}

/** `days` = one entry per calendar day, oldest first, ending with today. */
export function computeStreak(days: DayCount[]) {
  const states = days.map(dayState);
  let i = states.length - 1;
  if (i >= 0 && states[i] !== 'full') i--; // today still open (or missed → handled below)
  if (states.length && states[states.length - 1] === 'missed') i = -1; // a missed dose today ends the streak
  let current = 0;
  let start: string | null = null;
  for (; i >= 0; i--) {
    if (states[i] === 'full') {
      current++;
      start = days[i].date;
    } else if (states[i] === 'none') continue; // a day with no doses neither breaks nor extends
    else break;
  }
  let best = 0;
  let run = 0;
  for (const st of states) {
    if (st === 'full') best = Math.max(best, ++run);
    else if (st === 'missed') run = 0;
  }
  const next = MILESTONES.find((m) => m > current) ?? null;
  const reached = [...MILESTONES].reverse().find((m) => m <= current) ?? null;
  return { current, best: Math.max(best, current), start, next, reached, last7: days.slice(-7).map((d) => ({ date: d.date, state: dayState(d) })) };
}
