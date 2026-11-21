import { addDays } from './time';

export type StockStatus = 'safe' | 'soon' | 'critical';

export interface RefillInput {
  currentQuantity: number;
  unitsPerDose: number;
  dosesPerDay: number;
  today: string;
  endDate: string | null;
}

export interface RefillConfig {
  soonDays: number;
  criticalDays: number;
  bufferDays: number;
}

export interface RefillPrediction {
  remaining: number;
  perDay: number;
  daysLeft: number | null;
  runOutDate: string | null;
  refillBy: string | null;
  status: StockStatus;
}

export function predictRefill(i: RefillInput, cfg: RefillConfig): RefillPrediction {
  const perDay = i.unitsPerDose * i.dosesPerDay;
  if (perDay <= 0) return { remaining: i.currentQuantity, perDay: 0, daysLeft: null, runOutDate: null, refillBy: null, status: 'safe' };
  const daysLeft = Math.floor(i.currentQuantity / perDay);
  const runOutDate = addDays(i.today, daysLeft);
  const refillBy = addDays(i.today, Math.max(0, daysLeft - cfg.bufferDays));
  // If the course ends before the stock runs out, no refill is needed.
  const stillNeeded = !i.endDate || i.endDate >= runOutDate;
  const status: StockStatus = !stillNeeded
    ? 'safe'
    : daysLeft <= cfg.criticalDays
      ? 'critical'
      : daysLeft <= cfg.soonDays
        ? 'soon'
        : 'safe';
  return { remaining: i.currentQuantity, perDay, daysLeft, runOutDate, refillBy: stillNeeded ? refillBy : null, status };
}
