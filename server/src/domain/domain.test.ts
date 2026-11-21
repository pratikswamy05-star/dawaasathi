import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectConflicts, type RxForCheck } from './conflicts';
import { nextEscalation, isRepeatedMiss } from './escalation';
import { predictRefill } from './refill';
import { computeRisk } from './riskScore';
import { defaultTimes, scheduleTimes } from './schedule';

const rx = (o: Partial<RxForCheck> & Pick<RxForCheck, 'id' | 'medicationId' | 'medicationName'>): RxForCheck => ({
  activeIngredients: [o.medicationName.toLowerCase()],
  dosage: '500mg',
  frequency: 'OD',
  times: [],
  foodRule: 'after',
  prescriber: 'Dr. A',
  startDate: '2026-11-01',
  endDate: null,
  ...o,
});

describe('schedule', () => {
  it('derives default times from frequency and food rule', () => {
    assert.deepEqual(defaultTimes('BD', 'after'), ['08:30', '20:30']);
    assert.deepEqual(defaultTimes('TDS', 'before'), ['07:30', '12:30', '19:30']);
    assert.deepEqual(defaultTimes('HS', 'none'), ['21:30']);
  });
  it('prefers explicit times, sorted and de-duplicated', () => {
    assert.deepEqual(scheduleTimes({ frequency: 'OD', foodRule: 'after', times: ['20:00', '08:00', '08:00'] }), ['08:00', '20:00']);
  });
});

describe('conflicts', () => {
  it('flags the same active ingredient from different prescribers', () => {
    const c = detectConflicts([
      rx({ id: 1, medicationId: 1, medicationName: 'Metformin 500', activeIngredients: ['metformin'], prescriber: 'Dr. Kavya (PHC)' }),
      rx({ id: 2, medicationId: 2, medicationName: 'Glycomet 500', activeIngredients: ['Metformin'], prescriber: 'Dr. Suresh (Private)' }),
    ]);
    assert.equal(c[0].type, 'duplicate_prescriber');
    assert.match(c[0].message, /same active ingredient/);
    assert.match(c[0].message, /verify with the doctor\/pharmacist/);
  });
  it('flags a duplicate medicine', () => {
    const c = detectConflicts([rx({ id: 1, medicationId: 5, medicationName: 'Telmisartan' }), rx({ id: 2, medicationId: 5, medicationName: 'Telmisartan' })]);
    assert.equal(c[0].type, 'duplicate_medicine');
    assert.match(c[0].message, /Possible duplicate medication detected/);
  });
  it('ignores prescriptions whose dates do not overlap', () => {
    const c = detectConflicts([
      rx({ id: 1, medicationId: 5, medicationName: 'Telmisartan', endDate: '2026-11-05' }),
      rx({ id: 2, medicationId: 5, medicationName: 'Telmisartan', startDate: '2026-11-10' }),
    ]);
    assert.equal(c.length, 0);
  });
  it('flags missing dosage', () => {
    const c = detectConflicts([rx({ id: 1, medicationId: 9, medicationName: 'Sitagliptin', dosage: null })]);
    assert.equal(c[0].type, 'missing_dosage');
  });
  it('flags before-food and after-food medicines at the same time', () => {
    const c = detectConflicts([
      rx({ id: 1, medicationId: 1, medicationName: 'Atenolol', foodRule: 'before', times: ['08:00'] }),
      rx({ id: 2, medicationId: 2, medicationName: 'Metformin', foodRule: 'after', times: ['08:00'] }),
    ]);
    assert.ok(c.some((x) => x.type === 'schedule_conflict'));
  });
  it('flags a before-food medicine scheduled after breakfast', () => {
    const c = detectConflicts([rx({ id: 1, medicationId: 3, medicationName: 'Glimepiride', foodRule: 'before', times: ['08:30'] })]);
    assert.equal(c[0].type, 'food_timing');
  });
  it('returns nothing for a clean list', () => {
    assert.equal(detectConflicts([rx({ id: 1, medicationId: 1, medicationName: 'Metformin' }), rx({ id: 2, medicationId: 2, medicationName: 'Telmisartan' })]).length, 0);
  });
});

describe('escalation', () => {
  const cfg = { reminder1Min: 10, reminder2Min: 20, caregiverMin: 45 };
  const at = new Date('2026-11-21T08:00:00');
  const later = (m: number) => new Date(at.getTime() + m * 60000);
  it('walks due -> reminder1 -> reminder2 -> missed', () => {
    let d = { status: 'pending' as const, scheduledAt: at, reminderCount: 0, escalationLevel: 0 };
    const steps: (string | null)[] = [];
    for (const m of [-5, 0, 5, 10, 15, 20, 30, 45, 50]) {
      const r = nextEscalation(d, later(m), cfg);
      steps.push(r.action);
      d = { status: r.status as 'pending', scheduledAt: at, reminderCount: r.reminderCount, escalationLevel: r.escalationLevel };
    }
    assert.deepEqual(steps, [null, 'due', null, 'reminder1', null, 'reminder2', null, 'missed', null]);
  });
  it('does nothing for taken doses', () => {
    assert.equal(nextEscalation({ status: 'taken', scheduledAt: at, reminderCount: 0, escalationLevel: 0 }, later(60), cfg).action, null);
  });
  it('jumps straight to missed if the server was offline for a long time', () => {
    assert.equal(nextEscalation({ status: 'pending', scheduledAt: at, reminderCount: 0, escalationLevel: 0 }, later(120), cfg).action, 'missed');
  });
  it('detects repeated misses', () => {
    assert.equal(isRepeatedMiss(3, 3), true);
    assert.equal(isRepeatedMiss(2, 3), false);
  });
});

describe('refill', () => {
  const cfg = { soonDays: 7, criticalDays: 3, bufferDays: 2 };
  it('predicts days left and refill date', () => {
    const r = predictRefill({ currentQuantity: 10, unitsPerDose: 1, dosesPerDay: 2, today: '2026-11-21', endDate: null }, cfg);
    assert.equal(r.daysLeft, 5);
    assert.equal(r.runOutDate, '2026-11-26');
    assert.equal(r.refillBy, '2026-11-24');
    assert.equal(r.status, 'soon');
  });
  it('is critical at 3 days or less', () => {
    assert.equal(predictRefill({ currentQuantity: 4, unitsPerDose: 1, dosesPerDay: 3, today: '2026-11-21', endDate: null }, cfg).status, 'critical');
  });
  it('is safe if the course ends before stock runs out', () => {
    assert.equal(predictRefill({ currentQuantity: 4, unitsPerDose: 1, dosesPerDay: 1, today: '2026-11-21', endDate: '2026-11-23' }, cfg).status, 'safe');
  });
});

describe('risk score', () => {
  it('is 100 / low for a perfect patient', () => {
    const r = computeRisk({ adherencePct: 100, missed7d: 0, refillCritical: 0, refillSoon: 0, conflicts: 0, openAlerts: 0 });
    assert.equal(r.score, 100);
    assert.equal(r.level, 'low');
  });
  it('explains every deduction', () => {
    const r = computeRisk({ adherencePct: 54, missed7d: 7, refillCritical: 1, refillSoon: 0, conflicts: 1, openAlerts: 2 });
    assert.equal(r.score, 100 - 18 - 20 - 10 - 5 - 4);
    assert.equal(r.level, 'high');
    assert.equal(r.factors.length, 5);
  });
});
