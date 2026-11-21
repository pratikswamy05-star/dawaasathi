import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chatReply, type ChatContext } from './chatbot';

const ctx: ChatContext = {
  patientName: 'Lakshmi',
  today: [
    { name: 'Telmisartan 40', time: '8:30 AM', status: 'taken', foodRule: 'after', due: true },
    { name: 'Metformin 500', time: '8:30 PM', status: 'pending', foodRule: 'after', due: false },
    { name: 'Atorvastatin 10', time: '9:30 PM', status: 'pending', foodRule: 'none', due: false },
  ],
  prescriptions: [
    { name: 'Metformin 500', ingredients: ['metformin'], dosage: '500mg', schedule: '8:30 AM, 8:30 PM', foodRule: 'after', remaining: 10, daysLeft: 5, refillBy: '2026-11-24', stock: 'soon' },
    { name: 'Telmisartan 40', ingredients: ['telmisartan'], dosage: '40mg', schedule: '8:30 AM', foodRule: 'after', remaining: 30, daysLeft: 30, refillBy: null, stock: 'safe' },
  ],
  catalog: [
    { name: 'Metformin 500', ingredients: ['metformin'], category: 'Diabetes', instructions: 'Take with or after food.' },
    { name: 'Glimepiride 1', ingredients: ['glimepiride'], category: 'Diabetes', instructions: 'Usually taken with breakfast.' },
  ],
};

describe('chatbot', () => {
  it('sends emergencies to 108 first, in any language', () => {
    for (const q of ['I have chest pain', 'ಎದೆ ನೋವು ಇದೆ', 'सीने में दर्द है']) {
      const r = chatReply(q, 'en', ctx);
      assert.equal(r.intent, 'emergency', q);
      assert.equal(r.emergency, true);
    }
  });
  it('never advises a double dose after a missed dose', () => {
    const r = chatReply('I missed my dose, should I take double?', 'en', ctx);
    assert.equal(r.intent, 'missed_dose');
    assert.match(r.text, /do NOT take an extra or double dose/);
  });
  it('refuses diagnosis and dose changes', () => {
    for (const q of ['Do I have diabetes?', 'Should I stop taking Telmisartan?', 'can you prescribe something', 'मुझे क्या बीमारी है']) {
      assert.equal(chatReply(q, 'en', ctx).intent, 'refusal', q);
    }
  });
  it('answers next medicine from the real schedule', () => {
    const r = chatReply('When is my next medicine?', 'en', ctx);
    assert.equal(r.intent, 'next_dose');
    assert.match(r.text, /Metformin 500 at 8:30 PM/);
  });
  it('lists today in Kannada', () => {
    const r = chatReply('ಇಂದಿನ ಔಷಧಿ', 'kn', ctx);
    assert.equal(r.intent, 'today');
    assert.equal(r.lines.length, 3);
    assert.match(r.lines[0], /ತೆಗೆದುಕೊಂಡಿದೆ/);
  });
  it('reports stock and refill needs', () => {
    const r = chatReply('how many tablets left', 'en', ctx);
    assert.equal(r.intent, 'stock');
    assert.ok(r.lines.some((l) => /refill soon for: Metformin 500/.test(l)));
  });
  it('explains a prescribed medicine with the patient’s own dose', () => {
    const r = chatReply('what is metformin for', 'en', ctx);
    assert.equal(r.intent, 'about_medicine');
    assert.match(r.text, /diabetes/);
    assert.ok(r.lines.some((l) => /8:30 AM, 8:30 PM/.test(l)));
  });
  it('warns when a medicine is not prescribed', () => {
    const r = chatReply('tell me about glimepiride', 'hi', ctx);
    assert.ok([r.text, ...r.lines].some((l) => /पर्ची में नहीं/.test(l)));
  });
  it('answers before/after food', () => {
    assert.match(chatReply('metformin before or after food?', 'en', ctx).text, /after food/);
  });
  it('greets and always includes the disclaimer', () => {
    const r = chatReply('namaste', 'hi', ctx);
    assert.equal(r.intent, 'greeting');
    assert.match(r.disclaimer, /सलाह नहीं/);
  });
  it('falls back politely', () => {
    assert.equal(chatReply('what is the weather', 'en', ctx).intent, 'unknown');
  });
});
