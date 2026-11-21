import { fromMin, toMin } from './time';

export type Frequency = 'OD' | 'BD' | 'TDS' | 'QID' | 'HS';
export type FoodRule = 'before' | 'after' | 'with' | 'none';
type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'bedtime';

export const FREQUENCIES: Frequency[] = ['OD', 'BD', 'TDS', 'QID', 'HS'];
export const FOOD_RULES: FoodRule[] = ['before', 'after', 'with', 'none'];

/** Typical rural meal times. Used for default dose times and food-timing checks. */
export const MEALS: Record<Exclude<MealSlot, 'bedtime'>, string> = { breakfast: '08:00', lunch: '13:00', dinner: '20:00' };
export const BEDTIME = '21:30';

const FREQ_SLOTS: Record<Frequency, MealSlot[]> = {
  OD: ['breakfast'],
  BD: ['breakfast', 'dinner'],
  TDS: ['breakfast', 'lunch', 'dinner'],
  QID: ['breakfast', 'lunch', 'dinner', 'bedtime'],
  HS: ['bedtime'],
};

const FOOD_OFFSET: Record<FoodRule, number> = { before: -30, after: 30, with: 0, none: 0 };

export function defaultTimes(freq: Frequency, food: FoodRule): string[] {
  return FREQ_SLOTS[freq].map((slot) =>
    slot === 'bedtime' ? BEDTIME : fromMin(toMin(MEALS[slot]) + FOOD_OFFSET[food]),
  );
}

export interface SchedulableRx {
  frequency: Frequency | null;
  foodRule: FoodRule;
  times: string[];
}

/** Explicit times win; otherwise derive from frequency + food rule. Empty = cannot schedule (missing info). */
export function scheduleTimes(rx: SchedulableRx): string[] {
  if (rx.times?.length) return [...new Set(rx.times)].sort();
  if (!rx.frequency) return [];
  return defaultTimes(rx.frequency, rx.foodRule);
}

export const dosesPerDay = (rx: SchedulableRx) => scheduleTimes(rx).length;

export const FOOD_LABEL: Record<FoodRule, string> = {
  before: 'before food',
  after: 'after food',
  with: 'with food',
  none: 'any time',
};
