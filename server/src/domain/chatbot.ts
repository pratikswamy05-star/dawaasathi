/**
 * "Ask DawaaSathi" — medicine-information chatbot. Rule-based, runs on the server, no API keys.
 * It INFORMS ONLY: never diagnoses, never prescribes, never changes or doubles a dose.
 * Answers use the patient's own prescriptions so replies are specific ("your Metformin is at 8:30 AM").
 */
export type Lang = 'en' | 'kn' | 'hi';
export type Intent = 'emergency' | 'missed_dose' | 'refusal' | 'greeting' | 'food_rule' | 'about_medicine' | 'next_dose' | 'stock' | 'today' | 'unknown';

export interface ChatDose {
  name: string;
  time: string; // "8:30 AM"
  status: 'pending' | 'taken' | 'missed';
  foodRule: FoodRule;
  due: boolean; // scheduled time has passed
}
type FoodRule = 'before' | 'after' | 'with' | 'none';

export interface ChatRx {
  name: string;
  ingredients: string[];
  dosage: string | null;
  schedule: string; // "8:30 AM, 8:30 PM"
  foodRule: FoodRule;
  remaining: number;
  daysLeft: number | null;
  refillBy: string | null;
  stock: 'safe' | 'soon' | 'critical';
}

export interface ChatMed {
  name: string;
  ingredients: string[];
  category: 'BP' | 'Diabetes' | 'Cholesterol' | 'Other';
  instructions: string | null;
}

export interface ChatContext {
  patientName: string;
  today: ChatDose[];
  prescriptions: ChatRx[];
  catalog: ChatMed[];
}

export interface ChatReply {
  intent: Intent;
  text: string;
  lines: string[];
  emergency: boolean;
  disclaimer: string;
}

const T = {
  en: {
    greeting: 'Namaste {name}! Ask me about your medicines: today’s list, your next medicine, tablets left, before or after food, or what a medicine is for. I cannot diagnose or change doses.',
    todayHeader: 'Your medicines today:',
    todayNone: 'No medicines are scheduled for today.',
    next: 'Your next medicine is {med} at {time}, {food}.',
    nextOverdue: '{med} was due at {time} ({food}) and is not marked yet. If you have taken it, press TAKEN.',
    noNext: 'No more medicines today. Well done!',
    stockHeader: 'Medicine stock:',
    stockLine: '{med}: {n} tablets, about {days} days left',
    refill: 'Please arrange a refill soon for: {meds}.',
    stockOk: 'Your stock is fine for now.',
    about: '{med} is a {category} medicine.',
    yours: 'Your prescription: {dosage} at {schedule}, {food}.',
    notYours: 'This medicine is not in your current prescriptions. Ask your doctor before taking any new medicine.',
    food: '{med} should be taken {food}.',
    foodYours: 'Your {med} is at {schedule}, {food}.',
    missed:
      'If you missed a dose: do NOT take an extra or double dose. Take your next dose at its usual time unless your doctor has told you otherwise. If you are unsure, or you miss doses often, talk to your doctor or ASHA worker.',
    refusal: 'I can’t diagnose illness, prescribe, or change your medicines or doses. Please talk to your doctor or pharmacist.',
    emergency: 'This could be serious. Seek immediate medical attention — call 108 now, or contact your healthcare provider.',
    unknown: 'Sorry, I didn’t understand. Try: “my medicines today”, “next medicine”, “tablets left”, or a medicine name.',
    disclaimer: 'For information only — not medical advice. Consult your doctor.',
    status: { taken: 'taken ✓', missed: 'missed ✕', due: 'due now', later: 'later' },
    foodLabel: { before: 'before food', after: 'after food', with: 'with food', none: 'at any time' },
    category: { BP: 'blood pressure', Diabetes: 'diabetes (blood sugar)', Cholesterol: 'cholesterol', Other: 'general' },
  },
  kn: {
    greeting: 'ನಮಸ್ಕಾರ {name}! ನಿಮ್ಮ ಔಷಧಿಗಳ ಬಗ್ಗೆ ಕೇಳಿ: ಇಂದಿನ ಪಟ್ಟಿ, ಮುಂದಿನ ಔಷಧಿ, ಉಳಿದ ಮಾತ್ರೆಗಳು, ಊಟಕ್ಕೆ ಮೊದಲು ಅಥವಾ ನಂತರ. ನಾನು ರೋಗನಿರ್ಣಯ ಮಾಡುವುದಿಲ್ಲ, ಡೋಸ್ ಬದಲಿಸುವುದಿಲ್ಲ.',
    todayHeader: 'ಇಂದಿನ ನಿಮ್ಮ ಔಷಧಿಗಳು:',
    todayNone: 'ಇಂದು ಯಾವುದೇ ಔಷಧಿ ಇಲ್ಲ.',
    next: 'ನಿಮ್ಮ ಮುಂದಿನ ಔಷಧಿ {med}, {time} ಕ್ಕೆ, {food}.',
    nextOverdue: '{med} {time} ಕ್ಕೆ ({food}) ತೆಗೆದುಕೊಳ್ಳಬೇಕಿತ್ತು. ತೆಗೆದುಕೊಂಡಿದ್ದರೆ "ತೆಗೆದುಕೊಂಡೆ" ಒತ್ತಿ.',
    noNext: 'ಇಂದು ಇನ್ನು ಔಷಧಿ ಇಲ್ಲ. ಒಳ್ಳೆಯದು!',
    stockHeader: 'ಔಷಧಿ ದಾಸ್ತಾನು:',
    stockLine: '{med}: {n} ಮಾತ್ರೆಗಳು, ಸುಮಾರು {days} ದಿನ ಸಾಕು',
    refill: 'ದಯವಿಟ್ಟು ಬೇಗ ಮರುಪೂರಣ ಮಾಡಿ: {meds}.',
    stockOk: 'ಈಗ ನಿಮ್ಮ ದಾಸ್ತಾನು ಸಾಕಷ್ಟಿದೆ.',
    about: '{med} {category} ಔಷಧಿ.',
    yours: 'ನಿಮ್ಮ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್: {dosage}, {schedule}, {food}.',
    notYours: 'ಈ ಔಷಧಿ ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್‌ನಲ್ಲಿ ಇಲ್ಲ. ಹೊಸ ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳುವ ಮೊದಲು ವೈದ್ಯರನ್ನು ಕೇಳಿ.',
    food: '{med} ಅನ್ನು {food} ತೆಗೆದುಕೊಳ್ಳಬೇಕು.',
    foodYours: 'ನಿಮ್ಮ {med}: {schedule}, {food}.',
    missed: 'ಡೋಸ್ ತಪ್ಪಿದರೆ: ಹೆಚ್ಚುವರಿ ಅಥವಾ ಎರಡು ಪಟ್ಟು ಡೋಸ್ ತೆಗೆದುಕೊಳ್ಳಬೇಡಿ. ವೈದ್ಯರು ಬೇರೆ ಹೇಳದಿದ್ದರೆ ಮುಂದಿನ ಡೋಸ್ ಅನ್ನು ಸಾಮಾನ್ಯ ಸಮಯಕ್ಕೆ ತೆಗೆದುಕೊಳ್ಳಿ. ಸಂದೇಹವಿದ್ದರೆ ವೈದ್ಯರು ಅಥವಾ ಆಶಾ ಕಾರ್ಯಕರ್ತೆಯನ್ನು ಸಂಪರ್ಕಿಸಿ.',
    refusal: 'ನಾನು ರೋಗನಿರ್ಣಯ ಮಾಡಲು, ಔಷಧಿ ಬರೆಯಲು ಅಥವಾ ಡೋಸ್ ಬದಲಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ವೈದ್ಯರು ಅಥವಾ ಫಾರ್ಮಸಿಸ್ಟ್ ಜೊತೆ ಮಾತನಾಡಿ.',
    emergency: 'ಇದು ಗಂಭೀರವಾಗಿರಬಹುದು. ತಕ್ಷಣ ವೈದ್ಯಕೀಯ ಸಹಾಯ ಪಡೆಯಿರಿ — ಈಗಲೇ 108 ಗೆ ಕರೆ ಮಾಡಿ.',
    unknown: 'ಕ್ಷಮಿಸಿ, ಅರ್ಥವಾಗಲಿಲ್ಲ. ಕೇಳಿ: “ಇಂದಿನ ಔಷಧಿ”, “ಮುಂದಿನ ಔಷಧಿ”, “ಉಳಿದ ಮಾತ್ರೆ”, ಅಥವಾ ಔಷಧಿಯ ಹೆಸರು.',
    disclaimer: 'ಮಾಹಿತಿಗಾಗಿ ಮಾತ್ರ — ಇದು ವೈದ್ಯಕೀಯ ಸಲಹೆ ಅಲ್ಲ. ನಿಮ್ಮ ವೈದ್ಯರನ್ನು ಸಂಪರ್ಕಿಸಿ.',
    status: { taken: 'ತೆಗೆದುಕೊಂಡಿದೆ ✓', missed: 'ತಪ್ಪಿದೆ ✕', due: 'ಈಗ', later: 'ನಂತರ' },
    foodLabel: { before: 'ಊಟಕ್ಕೆ ಮೊದಲು', after: 'ಊಟದ ನಂತರ', with: 'ಊಟದ ಜೊತೆ', none: 'ಯಾವಾಗ ಬೇಕಾದರೂ' },
    category: { BP: 'ರಕ್ತದೊತ್ತಡದ', Diabetes: 'ಸಕ್ಕರೆ ಕಾಯಿಲೆಯ', Cholesterol: 'ಕೊಲೆಸ್ಟ್ರಾಲ್', Other: 'ಸಾಮಾನ್ಯ' },
  },
  hi: {
    greeting: 'नमस्ते {name}! अपनी दवाओं के बारे में पूछें: आज की सूची, अगली दवा, बची गोलियाँ, खाने से पहले या बाद में। मैं बीमारी की पहचान या खुराक में बदलाव नहीं करता।',
    todayHeader: 'आज की आपकी दवाइयाँ:',
    todayNone: 'आज कोई दवा नहीं है।',
    next: 'आपकी अगली दवा {med} है, {time} पर, {food}।',
    nextOverdue: '{med} {time} पर ({food}) लेनी थी और अभी दर्ज नहीं है। अगर ले ली है तो "ले ली" दबाएँ।',
    noNext: 'आज और कोई दवा नहीं। बहुत अच्छे!',
    stockHeader: 'दवा का स्टॉक:',
    stockLine: '{med}: {n} गोलियाँ, लगभग {days} दिन',
    refill: 'कृपया जल्द दवा भरवाएँ: {meds}।',
    stockOk: 'अभी आपका स्टॉक ठीक है।',
    about: '{med} {category} दवा है।',
    yours: 'आपकी पर्ची: {dosage}, {schedule}, {food}।',
    notYours: 'यह दवा आपकी मौजूदा पर्ची में नहीं है। कोई नई दवा लेने से पहले डॉक्टर से पूछें।',
    food: '{med} {food} लेनी चाहिए।',
    foodYours: 'आपकी {med}: {schedule}, {food}।',
    missed: 'खुराक छूट जाए तो: अतिरिक्त या दोगुनी खुराक न लें। डॉक्टर ने कुछ और न कहा हो तो अगली खुराक अपने सामान्य समय पर लें। संदेह हो या खुराक बार-बार छूटे तो डॉक्टर या आशा कार्यकर्ता से बात करें।',
    refusal: 'मैं बीमारी की पहचान, दवा लिखना या खुराक बदलना नहीं कर सकता। कृपया डॉक्टर या फार्मासिस्ट से बात करें।',
    emergency: 'यह गंभीर हो सकता है। तुरंत चिकित्सा सहायता लें — अभी 108 पर कॉल करें।',
    unknown: 'माफ़ कीजिए, समझ नहीं आया। पूछें: “आज की दवा”, “अगली दवा”, “बची गोलियाँ”, या दवा का नाम।',
    disclaimer: 'केवल जानकारी के लिए — यह चिकित्सकीय सलाह नहीं है। अपने डॉक्टर से सलाह लें।',
    status: { taken: 'ली गई ✓', missed: 'छूट गई ✕', due: 'अभी', later: 'बाद में' },
    foodLabel: { before: 'खाने से पहले', after: 'खाने के बाद', with: 'खाने के साथ', none: 'कभी भी' },
    category: { BP: 'ब्लड प्रेशर की', Diabetes: 'डायबिटीज़ (शुगर) की', Cholesterol: 'कोलेस्ट्रॉल की', Other: 'सामान्य' },
  },
} as const;

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

// Order matters: emergency > missed dose > refusal > the rest.
const EMERGENCY =
  /(chest pain|heart attack|can'?t breathe|cannot breathe|breathless|unconscious|fainted|faint|heavy bleeding|stroke|seizure|fits|paralys|suicid|overdose|poison|ಎದೆ ?ನೋವು|ಉಸಿರಾಡ|ಪ್ರಜ್ಞೆ|ಮೂರ್ಛೆ|ಹೃದಯಾಘಾತ|सीने में दर्द|सांस नहीं|साँस नहीं|बेहोश|दिल का दौरा|लकवा)/i;
const MISSED = /(missed|forgot|forget|skipped).*(dose|tablet|medicine|pill|it)|(dose|tablet|medicine|pill).*(missed|forgot)|(did ?n[o']?t|have ?n[o']?t|not) (take|taken|took|had)|ತಪ್ಪಿ|ಮರೆತ|ಮರೆತು|ತೆಗೆದುಕೊಂಡಿಲ್ಲ|ತಗೊಂಡಿಲ್ಲ|छूट|भूल ग|नहीं ली|नहीं लिया|नहीं खाई|नहीं खाया/i;
const REFUSAL =
  /(do i have|diagnos|what (disease|illness)|is it (cancer|serious)|should i (stop|increase|reduce|skip|double|change)|stop taking|double dose|extra dose|increase (the |my )?dose|reduce (the |my )?dose|change (my )?(dose|medicine)|prescribe|which medicine should|what medicine should|cure|ನನಗೆ ಯಾವ ರೋಗ|ರೋಗ ಇದೆಯಾ|ನಿಲ್ಲಿಸಬಹುದ|ಡೋಸ್ ಹೆಚ್ಚಿಸ|मुझे क्या बीमारी|कौन सी बीमारी|बंद कर द|खुराक बढ़ा|डबल)/i;
const GREETING = /^\s*(hi|hello|hey|namaste|namaskar|namaskara|good (morning|evening|afternoon)|help|what can you do|ನಮಸ್ಕಾರ|ಹಲೋ|नमस्ते|नमस्कार|हैलो)\b/i;
const FOOD = /(food|meal|eat|empty stomach|before|after|ಊಟ|ತಿಂಡಿ|ಖಾಲಿ ಹೊಟ್ಟೆ|खाना|खाने|भोजन|खाली पेट)/i;
const NEXT = /(next|when|what time|ಮುಂದಿನ|ಯಾವಾಗ|ಎಷ್ಟು ಗಂಟೆ|अगली|अगला|कब|कितने बजे)/i;
const STOCK = /(left|stock|remaining|refill|run out|running out|finish|how many tablets|ಉಳಿದ|ಮುಗಿ|ದಾಸ್ತಾನು|ಎಷ್ಟು ಮಾತ್ರೆ|बची|बाकी|खत्म|स्टॉक|कितनी गोलियाँ)/i;
const TODAY = /(today|my medicines|my tablets|list|schedule|what (do|should) i take|ಇಂದು|ಇಂದಿನ|ನನ್ನ ಔಷಧಿ|ಔಷಧಿಗಳು|आज|मेरी दवा|दवाइयाँ|दवाएं)/i;

const norm = (s: string) => s.toLowerCase();

/** Find a medicine the user named: by brand word ("Glycomet") or active ingredient ("metformin"). */
function findMedicine(q: string, ctx: ChatContext): { rx?: ChatRx; med?: ChatMed } | null {
  const text = norm(q);
  const words = (name: string, ingr: string[]) => [norm(name).split(/[\s-]/)[0], ...ingr.map(norm)].filter((w) => w.length >= 4);
  const rx = ctx.prescriptions.find((r) => words(r.name, r.ingredients).some((w) => text.includes(w)));
  const med = ctx.catalog.find((m) => words(m.name, m.ingredients).some((w) => text.includes(w)));
  if (!rx && !med) return null;
  return { rx, med: med ?? ctx.catalog.find((m) => rx && m.name === rx.name) };
}

export function chatReply(message: string, lang: Lang, ctx: ChatContext): ChatReply {
  const L = T[lang] ?? T.en;
  const q = message.replace(/[<>]/g, '').trim().slice(0, 300);
  const reply = (intent: Intent, text: string, lines: string[] = [], emergency = false): ChatReply => ({
    intent,
    text,
    lines,
    emergency,
    disclaimer: L.disclaimer,
  });

  if (EMERGENCY.test(q)) return reply('emergency', L.emergency, [], true);
  if (MISSED.test(q)) return reply('missed_dose', L.missed);
  if (REFUSAL.test(q)) return reply('refusal', L.refusal);
  if (GREETING.test(q) && q.split(/\s+/).length <= 5) return reply('greeting', fill(L.greeting, { name: ctx.patientName }));

  const found = findMedicine(q, ctx);
  if (found) {
    const { rx, med } = found;
    const name = rx?.name ?? med!.name;
    if (FOOD.test(q)) {
      if (rx) return reply('food_rule', fill(L.foodYours, { med: name, schedule: rx.schedule, food: L.foodLabel[rx.foodRule] }));
      return reply('food_rule', [med?.instructions, L.notYours].filter(Boolean).join(' '));
    }
    const lines: string[] = [];
    if (med) lines.push(fill(L.about, { med: name, category: L.category[med.category] }));
    if (med?.instructions) lines.push(med.instructions);
    if (rx) {
      lines.push(fill(L.yours, { dosage: rx.dosage ?? '—', schedule: rx.schedule, food: L.foodLabel[rx.foodRule] }));
      if (rx.daysLeft != null) lines.push(fill(L.stockLine, { med: name, n: rx.remaining, days: rx.daysLeft }));
    } else lines.push(L.notYours);
    return reply('about_medicine', lines[0], lines.slice(1));
  }

  if (NEXT.test(q)) {
    const pending = ctx.today.filter((d) => d.status === 'pending');
    const overdue = pending.find((d) => d.due);
    if (overdue) return reply('next_dose', fill(L.nextOverdue, { med: overdue.name, time: overdue.time, food: L.foodLabel[overdue.foodRule] }));
    const next = pending[0];
    return reply('next_dose', next ? fill(L.next, { med: next.name, time: next.time, food: L.foodLabel[next.foodRule] }) : L.noNext);
  }

  if (STOCK.test(q)) {
    const lines = ctx.prescriptions.map((r) => fill(L.stockLine, { med: r.name, n: r.remaining, days: r.daysLeft ?? '—' }));
    const low = ctx.prescriptions.filter((r) => r.stock !== 'safe').map((r) => r.name);
    return reply('stock', L.stockHeader, [...lines, low.length ? fill(L.refill, { meds: low.join(', ') }) : L.stockOk]);
  }

  if (TODAY.test(q)) {
    if (!ctx.today.length) return reply('today', L.todayNone);
    const lines = ctx.today.map((d) => {
      const st = d.status === 'pending' ? (d.due ? L.status.due : L.status.later) : L.status[d.status];
      return `${d.time} — ${d.name} (${L.foodLabel[d.foodRule]}) — ${st}`;
    });
    return reply('today', L.todayHeader, lines);
  }

  return reply('unknown', L.unknown);
}
