/**
 * Prescription conflict detection — RULE-BASED, deliberately conservative.
 * It only FLAGS things for a doctor/pharmacist to verify. It never says an interaction is dangerous
 * (that would need an approved drug-interaction database) and never suggests changing a dose.
 */
import { FOOD_LABEL, MEALS, scheduleTimes, type FoodRule, type Frequency } from './schedule';
import { fmt12, toMin } from './time';

export interface RxForCheck {
  id: number | string;
  medicationId: number;
  medicationName: string;
  activeIngredients: string[];
  dosage: string | null;
  frequency: Frequency | null;
  times: string[];
  foodRule: FoodRule;
  prescriber: string;
  startDate: string;
  endDate: string | null;
}

export type ConflictType =
  | 'duplicate_medicine'
  | 'same_ingredient'
  | 'duplicate_prescriber'
  | 'schedule_conflict'
  | 'missing_dosage'
  | 'food_timing';

export interface Conflict {
  type: ConflictType;
  severity: 'warning' | 'info';
  message: string;
  prescriptionIds: (number | string)[];
  medicines: string[];
}

const VERIFY = 'Please verify with the doctor/pharmacist.';
const FAR_FUTURE = '9999-12-31';
const overlaps = (a: RxForCheck, b: RxForCheck) =>
  a.startDate <= (b.endDate ?? FAR_FUTURE) && b.startDate <= (a.endDate ?? FAR_FUTURE);
const norm = (s: string) => s.trim().toLowerCase();

/** before vs after/with at the same moment cannot both be followed. */
const incompatibleFood = (a: FoodRule, b: FoodRule) =>
  (a === 'before' && (b === 'after' || b === 'with')) || (b === 'before' && (a === 'after' || a === 'with'));

export function detectConflicts(list: RxForCheck[]): Conflict[] {
  const out: Conflict[] = [];

  // 1. Missing dosage information
  for (const p of list) {
    const missing: string[] = [];
    if (!p.dosage || !p.dosage.trim()) missing.push('dosage');
    if (!p.frequency && !p.times.length) missing.push('frequency or time');
    if (missing.length) {
      out.push({
        type: 'missing_dosage',
        severity: 'warning',
        message: `Missing dosage information for ${p.medicationName} (${missing.join(', ')}). ${VERIFY}`,
        prescriptionIds: [p.id],
        medicines: [p.medicationName],
      });
    }
  }

  // 2. Pairwise checks
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (!overlaps(a, b)) continue;
      const ids = [a.id, b.id];
      const names = [a.medicationName, b.medicationName];
      const differentPrescribers = norm(a.prescriber) !== norm(b.prescriber);

      if (a.medicationId === b.medicationId) {
        out.push(
          differentPrescribers
            ? {
                type: 'duplicate_prescriber',
                severity: 'warning',
                message: `Possible duplicate medication detected: ${a.medicationName} is prescribed by both ${a.prescriber} and ${b.prescriber}. ${VERIFY}`,
                prescriptionIds: ids,
                medicines: names,
              }
            : {
                type: 'duplicate_medicine',
                severity: 'warning',
                message: `Possible duplicate medication detected: ${a.medicationName} appears in two prescriptions. ${VERIFY}`,
                prescriptionIds: ids,
                medicines: names,
              },
        );
      } else {
        const bIngr = new Set(b.activeIngredients.map(norm));
        const shared = a.activeIngredients.filter((x) => bIngr.has(norm(x)));
        if (shared.length) {
          out.push({
            type: differentPrescribers ? 'duplicate_prescriber' : 'same_ingredient',
            severity: 'warning',
            message:
              `Two prescriptions contain the same active ingredient (${shared.join(', ')}): ${a.medicationName} and ${b.medicationName}` +
              (differentPrescribers ? `, from different prescribers (${a.prescriber}, ${b.prescriber})` : '') +
              `. ${VERIFY}`,
            prescriptionIds: ids,
            medicines: names,
          });
        }
      }

      // Conflicting schedules: same time, food instructions that cannot both be followed
      if (incompatibleFood(a.foodRule, b.foodRule)) {
        const tb = new Set(scheduleTimes(b));
        for (const t of scheduleTimes(a)) {
          if (!tb.has(t)) continue;
          out.push({
            type: 'schedule_conflict',
            severity: 'warning',
            message: `Conflicting schedule at ${fmt12(t)}: ${a.medicationName} is to be taken ${FOOD_LABEL[a.foodRule]} but ${b.medicationName} ${FOOD_LABEL[b.foodRule]}. ${VERIFY}`,
            prescriptionIds: ids,
            medicines: names,
          });
        }
      }
    }
  }

  // 3. Food-timing conflicts (explicit times that contradict the food instruction)
  for (const p of list) {
    if (!p.times.length || (p.foodRule !== 'before' && p.foodRule !== 'after')) continue;
    for (const t of p.times) {
      const tm = toMin(t);
      for (const [meal, mt] of Object.entries(MEALS)) {
        const diff = tm - toMin(mt);
        const contradicts = p.foodRule === 'before' ? diff >= 0 && diff <= 120 : diff < 0 && diff >= -120;
        if (!contradicts) continue;
        out.push({
          type: 'food_timing',
          severity: 'info',
          message: `Food-timing conflict: ${p.medicationName} is marked "${FOOD_LABEL[p.foodRule]}" but scheduled at ${fmt12(t)}, ${
            diff === 0 ? 'the same time as' : diff > 0 ? 'after' : 'before'
          } ${meal} (${fmt12(mt)}). ${VERIFY}`,
          prescriptionIds: [p.id],
          medicines: [p.medicationName],
        });
        break;
      }
    }
  }

  return out;
}
