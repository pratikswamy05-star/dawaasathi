/**
 * Languages a medicine reminder can be SPOKEN in (more than the app's screen languages).
 * The patient — or their caregiver / ASHA / doctor — picks up to 3, played in order.
 * NOTE: Tamil, Telugu and Marathi phrases are drafts; have a native speaker check them.
 */
import type { FoodRule } from '../types';

export type ReminderLang = 'en' | 'kn' | 'hi' | 'ta' | 'te' | 'mr';

interface Phrases {
  name: string; // in English, for staff screens
  native: string; // in its own script
  tag: string; // BCP-47 tag for the speech engine
  speech: string; // {name} = medicine, {food} = food rule
  food: Record<FoodRule, string>;
  noExtra: string;
  sample: string;
}

export const REMINDER_LANGS: Record<ReminderLang, Phrases> = {
  en: {
    name: 'English',
    native: 'English',
    tag: 'en-IN',
    speech: 'It is time to take your medicine. {name}, {food}.',
    food: { before: 'before food', after: 'after food', with: 'with food', none: 'at any time' },
    noExtra: 'Do not take an extra dose.',
    sample: 'Metformin 500',
  },
  kn: {
    name: 'Kannada',
    native: 'ಕನ್ನಡ',
    tag: 'kn-IN',
    speech: 'ಈಗ ನಿಮ್ಮ ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯ. {name}, {food}.',
    food: { before: 'ಊಟಕ್ಕೆ ಮೊದಲು', after: 'ಊಟದ ನಂತರ', with: 'ಊಟದ ಜೊತೆ', none: 'ಯಾವಾಗ ಬೇಕಾದರೂ' },
    noExtra: 'ಹೆಚ್ಚುವರಿ ಡೋಸ್ ತೆಗೆದುಕೊಳ್ಳಬೇಡಿ.',
    sample: 'Metformin 500',
  },
  hi: {
    name: 'Hindi',
    native: 'हिंदी',
    tag: 'hi-IN',
    speech: 'आपकी दवा लेने का समय हो गया है। {name}, {food}।',
    food: { before: 'खाने से पहले', after: 'खाने के बाद', with: 'खाने के साथ', none: 'कभी भी' },
    noExtra: 'अतिरिक्त खुराक न लें।',
    sample: 'Metformin 500',
  },
  ta: {
    name: 'Tamil',
    native: 'தமிழ்',
    tag: 'ta-IN',
    speech: 'உங்கள் மருந்து எடுக்கும் நேரம் ஆகிவிட்டது. {name}, {food}.',
    food: { before: 'சாப்பாட்டுக்கு முன்', after: 'சாப்பாட்டுக்குப் பின்', with: 'சாப்பாட்டுடன்', none: 'எப்போது வேண்டுமானாலும்' },
    noExtra: 'கூடுதல் மாத்திரை எடுக்க வேண்டாம்.',
    sample: 'Metformin 500',
  },
  te: {
    name: 'Telugu',
    native: 'తెలుగు',
    tag: 'te-IN',
    speech: 'మీ మందు వేసుకునే సమయం అయింది. {name}, {food}.',
    food: { before: 'భోజనానికి ముందు', after: 'భోజనం తర్వాత', with: 'భోజనంతో పాటు', none: 'ఎప్పుడైనా' },
    noExtra: 'అదనపు మోతాదు వేసుకోవద్దు.',
    sample: 'Metformin 500',
  },
  mr: {
    name: 'Marathi',
    native: 'मराठी',
    tag: 'mr-IN',
    speech: 'तुमचे औषध घेण्याची वेळ झाली आहे. {name}, {food}.',
    food: { before: 'जेवणापूर्वी', after: 'जेवणानंतर', with: 'जेवणासोबत', none: 'कधीही' },
    noExtra: 'जास्तीचा डोस घेऊ नका.',
    sample: 'Metformin 500',
  },
};

export const ALL_REMINDER_LANGS = Object.keys(REMINDER_LANGS) as ReminderLang[];

export const isReminderLang = (l: string): l is ReminderLang => l in REMINDER_LANGS;

/** The full sentence spoken at reminder time, in one language. */
export function reminderSentence(lang: ReminderLang, medicine: string, food: FoodRule) {
  const p = REMINDER_LANGS[lang];
  return `${p.speech.replace('{name}', medicine).replace('{food}', p.food[food] ?? '')} ${p.noExtra}`;
}
