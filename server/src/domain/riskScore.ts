/**
 * Medication Safety Score — transparent and explainable (no black-box AI).
 * Starts at 100; each factor subtracts capped points, and every deduction is returned with its reason.
 */
export interface RiskInput {
  adherencePct: number | null; // last 7 days, null = no data yet
  missed7d: number;
  refillCritical: number;
  refillSoon: number;
  conflicts: number;
  openAlerts: number;
}

export interface RiskFactor {
  key: 'adherence' | 'missed' | 'refill' | 'conflicts' | 'alerts';
  label: string;
  points: number; // negative = deduction
  max: number;
  detail: string;
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskResult {
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
}

export function computeRisk(i: RiskInput): RiskResult {
  const adh = i.adherencePct ?? 100;
  const factors: RiskFactor[] = [
    {
      key: 'adherence',
      label: 'Medication adherence (last 7 days)',
      points: -Math.round(Math.min(40, (100 - adh) * 0.4)),
      max: 40,
      detail: i.adherencePct == null ? 'No doses recorded yet' : `${adh}% of doses taken (0.4 points per % below 100)`,
    },
    {
      key: 'missed',
      label: 'Missed doses (last 7 days)',
      points: -Math.min(20, i.missed7d * 3),
      max: 20,
      detail: `${i.missed7d} missed × 3 points`,
    },
    {
      key: 'refill',
      label: 'Refill risk',
      points: -Math.min(15, i.refillCritical * 10 + i.refillSoon * 4),
      max: 15,
      detail: `${i.refillCritical} may run out (10 each), ${i.refillSoon} refill soon (4 each)`,
    },
    {
      key: 'conflicts',
      label: 'Prescription conflicts',
      points: -Math.min(15, i.conflicts * 5),
      max: 15,
      detail: `${i.conflicts} unverified warning(s) × 5 points`,
    },
    {
      key: 'alerts',
      label: 'Recent unresolved alerts',
      points: -Math.min(10, i.openAlerts * 2),
      max: 10,
      detail: `${i.openAlerts} open alert(s) × 2 points`,
    },
  ];
  // Normalise -0 to 0 for display.
  for (const f of factors) f.points = f.points || 0;
  const score = Math.max(0, Math.min(100, 100 + factors.reduce((s, f) => s + f.points, 0)));
  const level: RiskLevel = score >= 75 ? 'low' : score >= 50 ? 'medium' : 'high';
  return { score, level, factors };
}
