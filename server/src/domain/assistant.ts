/**
 * "Saathi" voice assistant — understands short spoken COMMANDS (English, Kannada, Hindi, incl. Hinglish)
 * and turns them into safe actions. Anything that is not a command goes to the Ask DawaaSathi chatbot.
 * Safety: it never changes a prescription, never doubles a dose, and only marks doses that are already due.
 */
import type { VitalKind } from './vitals';

export type Page = 'home' | 'today' | 'reminders' | 'vitals' | 'doctor' | 'scan' | 'pharmacy' | 'report' | 'medicines' | 'history' | 'refills' | 'ask';

export type Command =
  | { type: 'taken' }
  | { type: 'vital'; kind: VitalKind; value1: number | null; value2: number | null }
  | { type: 'call'; who: 'caregiver' | 'asha' | 'ambulance' }
  | { type: 'help' }
  | { type: 'open'; page: Page }
  | { type: 'chat' };

/** Kannada (೦-೯) and Devanagari (०-९) digits → 0-9, lower-case, tidy spaces. */
export function normalizeSpeech(text: string) {
  return text
    .replace(/[೦-೯]/g, (d) => String(d.charCodeAt(0) - 0x0ce6))
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .toLowerCase()
    .replace(/[,!?।]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const has = (t: string, re: RegExp) => re.test(t);

const NEGATION = /\b(not|didn'?t|did not|haven'?t|have not|forgot|missed|skip(ped)?|no)\b|नहीं|नही|भूल|छूट|ಇಲ್ಲ|ಮರೆತ|ತಪ್ಪಿ/;
const TAKEN =
  /\b(i (have )?(took|taken|had|swallowed)|took (my|the|all)|taken (my|the|it|all)|i'?ve (taken|had)|(medicine|tablet|pill|dose)s? (is |are )?(taken|done)|done with (my )?(medicine|tablet)|(le|kha) (li|liya|lee)|maine (dawa|dawai|goli))\b|ले ली|ले लिया|खा ली|खा लिया|दवा ली|दवाई ली|ತೆಗೆದುಕೊಂಡೆ|ತಗೊಂಡೆ|ನುಂಗಿದೆ|ತೆಗೆದುಕೊಂಡಿದ್ದೇನೆ/;
const HELP = /\b(help( me)?|emergency help|send help|sos)\b|मदद|बचाओ|सहायता|ಸಹಾಯ|ಕಾಪಾಡಿ/;
const CALL = /\b(call|phone|ring|dial)\b|फोन|फ़ोन|कॉल|ಕರೆ|ಫೋನ್|ಕಾಲ್/;
const AMBULANCE = /\b(ambulance|108)\b|एम्बुलेंस|ಆಂಬುಲೆನ್ಸ್/;
const ASHA = /\basha\b|आशा|ಆಶಾ/;
const OPEN = /\b(open|show|go to|take me to|display)\b|खोलो|खोलिए|दिखाओ|दिखाइए|ತೆರೆ|ತೋರಿಸು|ತೆಗೆ/;

const PAGES: [Page, RegExp][] = [
  ['reminders', /\b(reminder|reminders|call settings|alarm)\b|रिमाइंडर|याद|ನೆನಪು|ರಿಮೈಂಡರ್/],
  ['vitals', /\b(reading|readings|vitals|bp chart|sugar chart|health)\b|रीडिंग|ಅಳತೆ/],
  ['doctor', /\b(doctor|video|consult)\b|डॉक्टर|ವೈದ್ಯ|ಡಾಕ್ಟರ್/],
  ['scan', /\b(scan|camera|photo)\b|स्कैन|ಸ್ಕ್ಯಾನ್/],
  ['pharmacy', /\b(pharmacy|jan aushadhi|medical shop|cheap|cheaper|generic)\b|दुकान|सस्ती|ಅಂಗಡಿ|ಜನ ಔಷಧಿ/],
  ['report', /\breport\b|रिपोर्ट|ವರದಿ/],
  ['history', /\bhistory\b|इतिहास|ಇತಿಹಾಸ/],
  ['refills', /\b(refill|refills|stock)\b|स्टॉक|ದಾಸ್ತಾನು/],
  ['today', /\btoday\b|आज|ಇಂದು/],
  ['medicines', /\b(medicines|my medicines|tablets)\b|दवाइयाँ|ಔಷಧಿಗಳು/],
  ['ask', /\b(chat|ask)\b/],
  ['home', /\b(home|dashboard)\b|होम|ಮುಖಪುಟ/],
];

const VITALS: [VitalKind, RegExp][] = [
  ['bp', /\b(bp|b\.p|blood pressure|pressure)\b|बीपी|ब्लड प्रेशर|रक्तचाप|ಬಿಪಿ|ರಕ್ತದೊತ್ತಡ/],
  ['sugar_random', /\b(sugar|glucose|diabetes reading)\b|शुगर|शक्कर|ಸಕ್ಕರೆ|ಶುಗರ್/],
  ['pulse', /\b(pulse|heart ?rate|heartbeat)\b|नाड़ी|नब्ज|धड़कन|ನಾಡಿ/],
  ['temperature', /\b(temperature|temp|fever)\b|बुखार|तापमान|ಜ್ವರ|ತಾಪಮಾನ/],
  ['weight', /\b(weight|weigh)\b|वजन|वज़न|ತೂಕ/],
];
const FASTING = /\b(fasting|empty stomach|before (breakfast|food|eating)|morning sugar)\b|खाली पेट|फास्टिंग|ಖಾಲಿ ಹೊಟ್ಟೆ|ಉಪವಾಸ/;

const numbers = (t: string) => (t.match(/\d+(\.\d+)?/g) ?? []).map(Number);

export function parseCommand(raw: string): Command {
  const t = normalizeSpeech(raw);
  if (!t) return { type: 'chat' };

  // 1. Readings ("my BP is 140 over 90", "sugar 180 fasting", "ಬಿಪಿ 140 90").
  for (const [kind, re] of VITALS) {
    if (!has(t, re)) continue;
    const n = numbers(t);
    if (kind === 'bp') return { type: 'vital', kind, value1: n[0] ?? null, value2: n[1] ?? null };
    let k: VitalKind = kind;
    if (kind === 'sugar_random' && has(t, FASTING)) k = 'sugar_fasting';
    let v = n[0] ?? null;
    if (k === 'temperature' && v != null && v < 45) v = (v * 9) / 5 + 32; // spoken in °C → store °F
    if (k === 'temperature' && v != null) v = Math.round(v * 10) / 10;
    // Questions like "what is my sugar?" have no number → open the readings page instead.
    if (v == null && !n.length) return { type: 'open', page: 'vitals' };
    return { type: 'vital', kind: k, value1: v, value2: null };
  }

  // 2. Calls (before HELP, so "call for help" still rings the family).
  if (has(t, CALL) || has(t, AMBULANCE)) {
    if (has(t, AMBULANCE)) return { type: 'call', who: 'ambulance' };
    if (has(t, ASHA)) return { type: 'call', who: 'asha' };
    if (/\b(doctor)\b|डॉक्टर|ವೈದ್ಯ|ಡಾಕ್ಟರ್/.test(t)) return { type: 'open', page: 'doctor' };
    return { type: 'call', who: 'caregiver' };
  }

  // 3. HELP button by voice.
  if (has(t, HELP)) return { type: 'help' };

  // 4. "I took my medicine" — but "I did NOT take it" is a question for the chatbot (it advises: no double dose).
  if (has(t, TAKEN) && !has(t, NEGATION)) return { type: 'taken' };

  // 5. Open a screen ("open reminders", "show my report").
  if (has(t, OPEN)) for (const [page, re] of PAGES) if (has(t, re)) return { type: 'open', page };

  return { type: 'chat' };
}
