/**
 * POST /api/assistant — "Saathi" voice assistant for patients.
 * Turns a spoken sentence into a safe action (mark due dose taken, save a reading, call family,
 * HELP, open a screen) or answers it with the Ask DawaaSathi chatbot (optionally Claude, if a server key is set).
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { now } from '../clock';
import { one } from '../db';
import { parseCommand, type Page } from '../domain/assistant';
import { chatReply, type Lang } from '../domain/chatbot';
import { fmt12, hhmmOf } from '../domain/time';
import { formatVital, VITAL_INFO, type VitalLevel } from '../domain/vitals';
import { ah, HttpError, parse } from '../http';
import { requireRole } from '../middleware/auth';
import { aiAnswer, aiEnabled } from '../services/ai';
import { audit } from '../services/audit';
import { confirmDose, dosesForDay } from '../services/doses';
import { patientRow, today } from '../services/overview';
import { contextFor } from './chat';
import { recordVital } from './features';

export const assistantRouter = Router();

const schema = z
  .object({
    text: z.string().trim().min(1, 'Say something').max(300),
    lang: z.enum(['en', 'kn', 'hi']).optional(),
  })
  .strict();

const limiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please wait a minute.' } });

type Dict = Record<string, string>;
const R: Record<Lang, Dict> = {
  en: {
    taken: 'Well done! I marked {meds} as taken.',
    takenNone: 'No medicine is due right now.',
    takenNext: 'Your next medicine is {med} at {time}.',
    takenAllDone: 'All of today’s medicines are already done. Great job!',
    vitalSaved: '{label} {value} saved.',
    vitalAsk: 'Please say the numbers. For example: my BP is 130 over 85.',
    vitalBad: 'I could not save that: {msg}',
    informed: 'I have informed your {who}.',
    call: 'Calling {name} now.',
    callNone: 'No phone number is saved for your {who}. Ask your ASHA worker to add it.',
    ambulance: 'Calling 108 ambulance now.',
    help: 'Shall I send a HELP alert to your family, ASHA worker and doctor? Press the red button to confirm.',
    open: 'Opening {page}.',
    normal: 'This is in the usual range.',
    watch: 'A little outside the usual range. Check again later.',
    high: 'Outside the usual range. Please tell your ASHA worker or doctor soon.',
    urgent: 'Far outside the usual range. Contact your doctor today. If you have chest pain or breathlessness, call 108.',
  },
  kn: {
    taken: 'ಒಳ್ಳೆಯದು! {meds} ತೆಗೆದುಕೊಂಡಿರುವುದಾಗಿ ದಾಖಲಿಸಿದ್ದೇನೆ.',
    takenNone: 'ಈಗ ಯಾವುದೇ ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯವಲ್ಲ.',
    takenNext: 'ನಿಮ್ಮ ಮುಂದಿನ ಔಷಧಿ {med}, {time} ಕ್ಕೆ.',
    takenAllDone: 'ಇಂದಿನ ಎಲ್ಲಾ ಔಷಧಿಗಳು ಮುಗಿದಿವೆ. ಬಹಳ ಒಳ್ಳೆಯದು!',
    vitalSaved: '{label} {value} ಉಳಿಸಲಾಗಿದೆ.',
    vitalAsk: 'ದಯವಿಟ್ಟು ಸಂಖ್ಯೆಗಳನ್ನು ಹೇಳಿ. ಉದಾಹರಣೆ: ನನ್ನ ಬಿಪಿ 130, 85.',
    vitalBad: 'ಉಳಿಸಲು ಆಗಲಿಲ್ಲ: {msg}',
    informed: 'ನಿಮ್ಮ {who} ಅವರಿಗೆ ತಿಳಿಸಿದ್ದೇನೆ.',
    call: '{name} ಅವರಿಗೆ ಈಗ ಕರೆ ಮಾಡುತ್ತಿದ್ದೇನೆ.',
    callNone: 'ನಿಮ್ಮ {who} ಅವರ ಫೋನ್ ಸಂಖ್ಯೆ ಇಲ್ಲ. ಆಶಾ ಕಾರ್ಯಕರ್ತೆಗೆ ಸೇರಿಸಲು ಹೇಳಿ.',
    ambulance: '108 ಆಂಬುಲೆನ್ಸ್‌ಗೆ ಈಗ ಕರೆ ಮಾಡುತ್ತಿದ್ದೇನೆ.',
    help: 'ನಿಮ್ಮ ಕುಟುಂಬ, ಆಶಾ ಕಾರ್ಯಕರ್ತೆ ಮತ್ತು ವೈದ್ಯರಿಗೆ ಸಹಾಯದ ಎಚ್ಚರಿಕೆ ಕಳುಹಿಸಲೇ? ಖಚಿತಪಡಿಸಲು ಕೆಂಪು ಬಟನ್ ಒತ್ತಿ.',
    open: '{page} ತೆರೆಯುತ್ತಿದ್ದೇನೆ.',
    normal: 'ಇದು ಸಾಮಾನ್ಯ ಮಟ್ಟದಲ್ಲಿದೆ.',
    watch: 'ಸ್ವಲ್ಪ ಹೆಚ್ಚು ಕಡಿಮೆ ಇದೆ. ನಂತರ ಮತ್ತೆ ಪರೀಕ್ಷಿಸಿ.',
    high: 'ಸಾಮಾನ್ಯ ಮಟ್ಟದಿಂದ ಹೊರಗಿದೆ. ಬೇಗ ಆಶಾ ಕಾರ್ಯಕರ್ತೆ ಅಥವಾ ವೈದ್ಯರಿಗೆ ತಿಳಿಸಿ.',
    urgent: 'ತುಂಬಾ ಹೆಚ್ಚು ವ್ಯತ್ಯಾಸವಿದೆ. ಇಂದೇ ವೈದ್ಯರನ್ನು ಸಂಪರ್ಕಿಸಿ. ಎದೆ ನೋವು ಅಥವಾ ಉಸಿರಾಟದ ತೊಂದರೆ ಇದ್ದರೆ 108 ಗೆ ಕರೆ ಮಾಡಿ.',
  },
  hi: {
    taken: 'बहुत अच्छा! मैंने {meds} को ली हुई दर्ज कर दिया है।',
    takenNone: 'अभी कोई दवा लेने का समय नहीं है।',
    takenNext: 'आपकी अगली दवा {med} है, {time} बजे।',
    takenAllDone: 'आज की सभी दवाएँ हो चुकी हैं। बहुत बढ़िया!',
    vitalSaved: '{label} {value} सेव हो गया।',
    vitalAsk: 'कृपया नंबर बोलिए। जैसे: मेरा बीपी 130 बटा 85 है।',
    vitalBad: 'सेव नहीं हो सका: {msg}',
    informed: 'मैंने आपके {who} को बता दिया है।',
    call: 'अभी {name} को फ़ोन कर रहा हूँ।',
    callNone: 'आपके {who} का फ़ोन नंबर सेव नहीं है। आशा दीदी से जुड़वाएँ।',
    ambulance: 'अभी 108 एम्बुलेंस को फ़ोन कर रहा हूँ।',
    help: 'क्या मैं आपके परिवार, आशा दीदी और डॉक्टर को मदद का अलर्ट भेजूँ? पक्का करने के लिए लाल बटन दबाएँ।',
    open: '{page} खोल रहा हूँ।',
    normal: 'यह सामान्य सीमा में है।',
    watch: 'थोड़ा सामान्य से बाहर है। बाद में फिर जाँचें।',
    high: 'सामान्य सीमा से बाहर है। जल्दी आशा दीदी या डॉक्टर को बताएँ।',
    urgent: 'सामान्य से बहुत ज़्यादा अलग है। आज ही डॉक्टर से संपर्क करें। सीने में दर्द या साँस की तकलीफ़ हो तो 108 पर कॉल करें।',
  },
};

const WHO: Record<Lang, Record<string, string>> = {
  en: { caregiver: 'family', asha: 'ASHA worker', doctor: 'doctor' },
  kn: { caregiver: 'ಕುಟುಂಬ', asha: 'ಆಶಾ ಕಾರ್ಯಕರ್ತೆ', doctor: 'ವೈದ್ಯರು' },
  hi: { caregiver: 'परिवार', asha: 'आशा दीदी', doctor: 'डॉक्टर' },
};

const VLABEL: Record<Lang, Record<string, string>> = {
  en: { bp: 'Blood pressure', sugar_fasting: 'Fasting sugar', sugar_random: 'Sugar', pulse: 'Pulse', temperature: 'Temperature', weight: 'Weight' },
  kn: { bp: 'ಬಿಪಿ', sugar_fasting: 'ಖಾಲಿ ಹೊಟ್ಟೆ ಸಕ್ಕರೆ', sugar_random: 'ಸಕ್ಕರೆ', pulse: 'ನಾಡಿ', temperature: 'ಜ್ವರ', weight: 'ತೂಕ' },
  hi: { bp: 'बीपी', sugar_fasting: 'खाली पेट शुगर', sugar_random: 'शुगर', pulse: 'नाड़ी', temperature: 'तापमान', weight: 'वज़न' },
};

const PAGE_NAME: Record<Lang, Record<Page, string>> = {
  en: { home: 'Home', today: "Today's medicines", reminders: 'Reminder calls', vitals: 'Health readings', doctor: 'Doctor call', scan: 'Scan medicine', pharmacy: 'Cheaper medicines', report: 'Weekly report', medicines: 'My medicines', history: 'History', refills: 'Refills', ask: 'Ask DawaaSathi' },
  kn: { home: 'ಮುಖಪುಟ', today: 'ಇಂದಿನ ಔಷಧಿಗಳು', reminders: 'ನೆನಪಿನ ಕರೆಗಳು', vitals: 'ಆರೋಗ್ಯ ಅಳತೆಗಳು', doctor: 'ವೈದ್ಯರ ಕರೆ', scan: 'ಔಷಧಿ ಸ್ಕ್ಯಾನ್', pharmacy: 'ಕಡಿಮೆ ಬೆಲೆಯ ಔಷಧಿ', report: 'ವಾರದ ವರದಿ', medicines: 'ನನ್ನ ಔಷಧಿಗಳು', history: 'ಇತಿಹಾಸ', refills: 'ರೀಫಿಲ್', ask: 'ಕೇಳಿ' },
  hi: { home: 'होम', today: 'आज की दवाएँ', reminders: 'रिमाइंडर कॉल', vitals: 'स्वास्थ्य रीडिंग', doctor: 'डॉक्टर कॉल', scan: 'दवा स्कैन', pharmacy: 'सस्ती दवाएँ', report: 'साप्ताहिक रिपोर्ट', medicines: 'मेरी दवाएँ', history: 'इतिहास', refills: 'रीफ़िल', ask: 'पूछें' },
};

const PAGE_PATH: Record<Page, string> = {
  home: '/patient/dashboard',
  today: '/patient/today',
  reminders: '/patient/reminders',
  vitals: '/patient/vitals',
  doctor: '/patient/doctor',
  scan: '/patient/scan',
  pharmacy: '/patient/pharmacy',
  report: '/patient/report',
  medicines: '/patient/medicines',
  history: '/patient/history',
  refills: '/patient/refills',
  ask: '/patient/ask',
};

const fill = (s: string, v: Record<string, string | number>) => Object.entries(v).reduce((acc, [k, x]) => acc.split(`{${k}}`).join(String(x)), s);

export type AssistantAction =
  | { type: 'call'; tel: string; name: string }
  | { type: 'confirm_help' }
  | { type: 'navigate'; to: string }
  | { type: 'refresh' };

assistantRouter.post(
  '/',
  limiter,
  requireRole('patient'),
  ah(async (req, res) => {
    const b = parse(schema, req.body);
    const own = await one('select id from patients where user_id = $1', [req.user!.id]);
    if (!own) throw new HttpError(404, 'No patient record is linked to this account');
    const patientId = Number(own.id);
    const lang: Lang = b.lang ?? ((await one('select language from users where id = $1', [req.user!.id]))?.language as Lang) ?? 'en';
    const r = R[lang];
    const ctx = await contextFor(patientId);

    let text = '';
    let lines: string[] = [];
    let action: AssistantAction | null = null;
    let emergency = false;
    let ai = false;
    let intent: string;

    // Emergencies always win (chest pain, breathlessness…): the chatbot answers with 108.
    const chat = chatReply(b.text, lang, ctx);
    const cmd = chat.intent === 'emergency' ? ({ type: 'chat' } as const) : parseCommand(b.text);
    intent = cmd.type === 'chat' ? `chat:${chat.intent}` : cmd.type;

    switch (cmd.type) {
      case 'taken': {
        // Only doses that are already due (never future ones), and only the earliest time slot.
        const doses = await dosesForDay(patientId, today());
        const nowMs = now().getTime();
        const due = doses.filter((d) => d.status === 'pending' && new Date(d.scheduled_at).getTime() <= nowMs + 30 * 60_000);
        if (!due.length) {
          const next = doses.find((d) => d.status === 'pending');
          text = next
            ? `${r.takenNone} ${fill(r.takenNext, { med: next.medication_name, time: fmt12(hhmmOf(new Date(next.scheduled_at))) })}`
            : r.takenAllDone;
          break;
        }
        const slot = new Date(due[0].scheduled_at).getTime();
        const batch = due.filter((d) => new Date(d.scheduled_at).getTime() === slot);
        for (const d of batch) await confirmDose(req.user!, Number(d.id), { status: 'taken', method: 'voice' });
        text = fill(r.taken, { meds: batch.map((d) => d.medication_name).join(', ') });
        const left = due.length - batch.length;
        if (left > 0) lines = [`+${left} more due: ${due.slice(batch.length).map((d) => d.medication_name).join(', ')}`];
        action = { type: 'refresh' };
        break;
      }
      case 'vital': {
        if (cmd.value1 == null || (cmd.kind === 'bp' && cmd.value2 == null)) {
          text = r.vitalAsk;
          action = { type: 'navigate', to: PAGE_PATH.vitals };
          break;
        }
        try {
          const saved = await recordVital(req, patientId, { kind: cmd.kind, value1: cmd.value1, value2: cmd.value2 ?? undefined, note: 'Saved by voice' });
          const level = saved.level as VitalLevel;
          text = `${fill(r.vitalSaved, { label: VLABEL[lang][cmd.kind] ?? VITAL_INFO[cmd.kind].label, value: formatVital(cmd.kind, cmd.value1, cmd.value2) })} ${r[level]}`;
          if (saved.alerted.length) text += ` ${fill(r.informed, { who: saved.alerted.map((w: string) => WHO[lang][w] ?? w).join(', ') })}`;
          emergency = level === 'urgent';
          action = { type: 'refresh' };
        } catch (e) {
          if (!(e instanceof HttpError)) throw e;
          text = fill(r.vitalBad, { msg: e.message });
        }
        break;
      }
      case 'call': {
        if (cmd.who === 'ambulance') {
          text = r.ambulance;
          action = { type: 'call', tel: '108', name: '108' };
          emergency = true;
          break;
        }
        const p = await patientRow(patientId);
        const phone = cmd.who === 'asha' ? p?.asha_phone : p?.caregiver_phone;
        const name = cmd.who === 'asha' ? p?.asha_name : p?.caregiver_name;
        if (!phone) text = fill(r.callNone, { who: WHO[lang][cmd.who] });
        else {
          text = fill(r.call, { name: name ?? WHO[lang][cmd.who] });
          action = { type: 'call', tel: String(phone), name: String(name ?? '') };
        }
        break;
      }
      case 'help':
        text = r.help;
        action = { type: 'confirm_help' };
        break;
      case 'open':
        text = fill(r.open, { page: PAGE_NAME[lang][cmd.page] });
        action = { type: 'navigate', to: PAGE_PATH[cmd.page] };
        break;
      default: {
        text = chat.text;
        lines = chat.lines;
        emergency = chat.emergency;
        if (chat.intent === 'unknown' && aiEnabled()) {
          const answer = await aiAnswer(b.text, lang, ctx);
          if (answer) {
            text = answer;
            lines = [];
            ai = true;
          }
        }
        if (emergency) action = { type: 'call', tel: '108', name: '108' };
      }
    }

    await audit(req, 'assistant_command', 'patient', patientId, { intent, ai });
    res.json({ heard: b.text, intent, reply: { text, lines, emergency }, action, ai, aiAvailable: aiEnabled() });
  }),
);
