/**
 * Rules for changing WHEN reminders ring. Caregivers / ASHA / doctors may move the times,
 * but never add or remove a dose — that would change the prescription, which only a doctor may do.
 */
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export const MIN_GAP_MINUTES = 180;

export function validateReminderTimes(times: string[], requiredCount: number): { ok: true; times: string[] } | { ok: false; error: string } {
  const sorted = [...times].sort();
  if (new Set(sorted).size !== sorted.length) return { ok: false, error: 'The same time is entered twice.' };
  if (sorted.length !== requiredCount)
    return {
      ok: false,
      error: `This medicine is prescribed ${requiredCount} time${requiredCount > 1 ? 's' : ''} a day, so set exactly ${requiredCount} reminder time${requiredCount > 1 ? 's' : ''}. Only the doctor can change how many doses.`,
    };
  for (let i = 1; i < sorted.length; i++)
    if (toMin(sorted[i]) - toMin(sorted[i - 1]) < MIN_GAP_MINUTES)
      return { ok: false, error: `Keep at least ${MIN_GAP_MINUTES / 60} hours between two doses of the same medicine (${sorted[i - 1]} and ${sorted[i]} are too close).` };
  return { ok: true, times: sorted };
}
