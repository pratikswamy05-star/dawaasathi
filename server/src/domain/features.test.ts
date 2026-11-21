import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { distanceKm, monthlySaving } from './geo';
import { levenshtein, matchMedicines, normalizeOcr } from './pillMatch';
import { classifyVital, formatVital, persistentHigh, weightChangeLevel } from './vitals';

describe('vitals', () => {
  it('grades blood pressure', () => {
    assert.equal(classifyVital('bp', 118, 76).level, 'normal');
    assert.equal(classifyVital('bp', 134, 82).level, 'watch');
    assert.equal(classifyVital('bp', 152, 94).level, 'high');
    assert.equal(classifyVital('bp', 186, 100).level, 'urgent');
    assert.equal(classifyVital('bp', 85, 55).direction, 'low');
  });
  it('grades sugar, including low sugar', () => {
    assert.equal(classifyVital('sugar_fasting', 92).level, 'normal');
    assert.equal(classifyVital('sugar_fasting', 140).level, 'high');
    assert.equal(classifyVital('sugar_fasting', 60).level, 'high');
    assert.equal(classifyVital('sugar_fasting', 45).level, 'urgent');
    assert.equal(classifyVital('sugar_random', 320).level, 'urgent');
  });
  it('never diagnoses — advice only points to people', () => {
    for (const lvl of [classifyVital('bp', 190, 125), classifyVital('sugar_random', 50)]) {
      assert.match(lvl.advice, /doctor|ASHA|108/);
      assert.doesNotMatch(lvl.advice, /diabetes|hypertension|increase|dose/i);
    }
  });
  it('formats readings and spots trends', () => {
    assert.equal(formatVital('bp', 140, 90), '140/90 mmHg');
    assert.equal(formatVital('temperature', 100.44), '100.4 °F');
    assert.equal(weightChangeLevel(60, 64), 'watch');
    assert.equal(persistentHigh(['high', 'urgent', 'high', 'normal']), true);
    assert.equal(persistentHigh(['high', 'normal', 'high']), false);
  });
});

describe('pill photo matching', () => {
  const meds = [
    { id: 1, name: 'Metformin 500', ingredients: ['metformin'], strength: '500mg' },
    { id: 2, name: 'Glycomet 500', ingredients: ['metformin'], strength: '500mg' },
    { id: 3, name: 'Telma-AM 40/5', ingredients: ['telmisartan', 'amlodipine'], strength: '40mg/5mg' },
    { id: 4, name: 'Amlodipine 5', ingredients: ['amlodipine'], strength: '5mg' },
  ];
  it('cleans OCR noise without breaking strengths', () => {
    assert.equal(normalizeOcr('GLYC0MET 500mg!!'), 'glycomet 500mg');
    assert.equal(levenshtein('metfornin', 'metformin'), 1);
  });
  it('finds the brand first, then the generic with the same ingredient', () => {
    const r = matchMedicines('Glycomet 500 Metformin Hydrochloride Tablets IP 500 mg', meds);
    assert.equal(r[0].name, 'Glycomet 500');
    assert.equal(r[0].strengthMatched, true);
    assert.ok(r.some((m) => m.name === 'Metformin 500'));
  });
  it('tolerates small OCR spelling errors', () => {
    const r = matchMedicines('TELMA-AM  Telmisartan & Amlodipne Tablets 40/5', meds);
    assert.equal(r[0].name, 'Telma-AM 40/5');
  });
  it('returns nothing for unrelated text', () => {
    assert.deepEqual(matchMedicines('Store in a cool dry place', meds), []);
  });
});

describe('pharmacy helpers', () => {
  it('computes distances', () => {
    const d = distanceKm(13.0072, 76.0962, 13.1656, 75.8656); // Hassan → Belur
    assert.ok(d > 25 && d < 35, `got ${d}`);
  });
  it('computes monthly generic savings', () => {
    assert.equal(monthlySaving(40, 12, 2), 168); // 60 tablets = 6 strips × ₹28
    assert.equal(monthlySaving(null, 12, 2), null);
  });
});

import { validateReminderTimes } from './reminderTimes';

describe('reminder time changes', () => {
  it('accepts the same number of doses, sorted', () => {
    assert.deepEqual(validateReminderTimes(['20:30', '08:30'], 2), { ok: true, times: ['08:30', '20:30'] });
  });
  it('never allows adding or removing a dose', () => {
    const r = validateReminderTimes(['08:00', '14:00', '20:00'], 2);
    assert.equal(r.ok, false);
    assert.match((r as { error: string }).error, /only the doctor/i);
  });
  it('blocks doses too close together and duplicates', () => {
    assert.equal(validateReminderTimes(['08:00', '09:30'], 2).ok, false);
    assert.equal(validateReminderTimes(['08:00', '08:00'], 2).ok, false);
  });
});

import { normalizeSpeech, parseCommand } from './assistant';

describe('voice assistant commands', () => {
  it('normalises Kannada and Devanagari digits', () => {
    assert.equal(normalizeSpeech('ಬಿಪಿ ೧೪೦ ೯೦'), 'ಬಿಪಿ 140 90');
    assert.equal(normalizeSpeech('शुगर १८०'), 'शुगर 180');
  });
  it('understands readings in three languages', () => {
    assert.deepEqual(parseCommand('My BP is 140 over 90'), { type: 'vital', kind: 'bp', value1: 140, value2: 90 });
    assert.deepEqual(parseCommand('ಬಿಪಿ 150/95'), { type: 'vital', kind: 'bp', value1: 150, value2: 95 });
    assert.deepEqual(parseCommand('खाली पेट शुगर 130'), { type: 'vital', kind: 'sugar_fasting', value1: 130, value2: null });
    assert.deepEqual(parseCommand('sugar is 210'), { type: 'vital', kind: 'sugar_random', value1: 210, value2: null });
    assert.deepEqual(parseCommand('temperature 38.5'), { type: 'vital', kind: 'temperature', value1: 101.3, value2: null });
    assert.deepEqual(parseCommand('what is my sugar'), { type: 'open', page: 'vitals' });
  });
  it('marks taken only when it is not a negative sentence', () => {
    assert.equal(parseCommand('I took my medicine').type, 'taken');
    assert.equal(parseCommand('maine dawa le li').type, 'taken');
    assert.equal(parseCommand('ಔಷಧಿ ತೆಗೆದುಕೊಂಡೆ').type, 'taken');
    assert.equal(parseCommand('मैंने दवा ले ली').type, 'taken');
    assert.equal(parseCommand('I did not take my medicine').type, 'chat');
    assert.equal(parseCommand('मैंने दवा नहीं ली').type, 'chat');
  });
  it('calls, help and navigation', () => {
    assert.deepEqual(parseCommand('call my son'), { type: 'call', who: 'caregiver' });
    assert.deepEqual(parseCommand('ASHA ko phone karo'), { type: 'call', who: 'asha' });
    assert.deepEqual(parseCommand('call ambulance'), { type: 'call', who: 'ambulance' });
    assert.deepEqual(parseCommand('call the doctor'), { type: 'open', page: 'doctor' });
    assert.equal(parseCommand('help me').type, 'help');
    assert.equal(parseCommand('ಸಹಾಯ ಮಾಡಿ').type, 'help');
    assert.deepEqual(parseCommand('open my reminders'), { type: 'open', page: 'reminders' });
    assert.deepEqual(parseCommand('रिपोर्ट दिखाओ'), { type: 'open', page: 'report' });
  });
  it('leaves questions to the chatbot', () => {
    assert.equal(parseCommand('when is my next medicine').type, 'chat');
    assert.equal(parseCommand('what is glycomet for').type, 'chat');
  });
});
