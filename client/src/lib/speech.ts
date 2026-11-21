import type { Lang } from '../types';

const TAG: Record<Lang, string> = { en: 'en-IN', kn: 'kn-IN', hi: 'hi-IN' };
let voices: SpeechSynthesisVoice[] = [];

export function initVoices() {
  if (!('speechSynthesis' in window)) return;
  const load = () => (voices = window.speechSynthesis.getVoices());
  load();
  window.speechSynthesis.onvoiceschanged = load;
}

/** Text-to-speech in the user's language (falls back to the browser default voice). */
export function speak(text: string, lang: Lang) {
  if (!('speechSynthesis' in window)) return false;
  const tag = TAG[lang];
  const u = new SpeechSynthesisUtterance(text);
  u.lang = tag;
  u.rate = 0.88;
  const v = voiceFor(tag);
  if (v) u.voice = v;
  else warnMissingVoice(tag);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  return true;
}

export const voiceInputSupported = () => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

const TAKEN = /\b(taken|took|done|yes)\b|ತೆಗೆದುಕೊಂಡೆ|ತಗೊಂಡೆ|ಹೌದು|ले ली|लिया|ली|हाँ|हां/i;
const MISSED = /\b(missed|miss|skip|no)\b|ತಪ್ಪಿದೆ|ಇಲ್ಲ|छूट|नहीं/i;

/** Listen once for "Taken" / "Missed" (English, Kannada, Hindi). Resolves null if unclear. */
export function listenForConfirmation(lang: Lang): Promise<'taken' | 'missed' | null> {
  return new Promise((resolve) => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return resolve(null);
    const rec = new Ctor();
    rec.lang = TAG[lang];
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    let done = false;
    const finish = (v: 'taken' | 'missed' | null) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(' ');
      // Negative words win: "नहीं ली" / "ತೆಗೆದುಕೊಂಡಿಲ್ಲ" mean NOT taken.
      finish(MISSED.test(text) ? 'missed' : TAKEN.test(text) ? 'taken' : null);
    };
    rec.onerror = () => finish(null);
    rec.onend = () => finish(null);
    rec.start();
    setTimeout(() => rec.stop(), 6000);
  });
}

/** Listen once and return what was said (used for spoken chatbot questions). */
export function listenText(lang: Lang): Promise<string | null> {
  return new Promise((resolve) => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return resolve(null);
    const rec = new Ctor();
    rec.lang = TAG[lang];
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let done = false;
    const finish = (v: string | null) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    rec.onresult = (e) => finish(e.results[0]?.[0]?.transcript?.trim() || null);
    rec.onerror = () => finish(null);
    rec.onend = () => finish(null);
    rec.start();
    setTimeout(() => rec.stop(), 8000);
  });
}

/** Browser notification (uses the service worker when available so it works with the app in the background). */
export async function showNotification(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: '/icon.svg', tag: title + body });
    else new Notification(title, { body, icon: '/icon.svg' });
  } catch {
    /* notifications are best-effort */
  }
}

export async function askNotificationPermission() {
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  try {
    await Notification.requestPermission();
  } catch {
    /* ignore */
  }
}

export const vibrate = () => navigator.vibrate?.([250, 120, 250]);

/* ---------- Multi-language reminder speech ---------- */

const LANG_NAMES: Record<string, string> = { en: 'English', kn: 'Kannada', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', mr: 'Marathi' };
const warned = new Set<string>();

/** Tell the user once per language that this device has no voice for it (instead of failing silently). */
function warnMissingVoice(tag: string) {
  const base = tag.slice(0, 2);
  if (base === 'en' || warned.has(base) || !voices.length) return;
  warned.add(base);
  window.dispatchEvent(new CustomEvent('voice-missing', { detail: LANG_NAMES[base] ?? tag }));
}

/** Resolves once the browser has loaded its voice list (Edge loads its online voices a moment after start). */
export function whenVoicesReady(timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve([]);
    const now = window.speechSynthesis.getVoices();
    if (now.length) {
      voices = now;
      return resolve(now);
    }
    const done = () => {
      voices = window.speechSynthesis.getVoices();
      resolve(voices);
    };
    window.speechSynthesis.addEventListener?.('voiceschanged', done, { once: true });
    setTimeout(done, timeoutMs);
  });
}

/** Rank voices: natural / online neural voices sound far better than the old desktop ones. */
const quality = (v: SpeechSynthesisVoice) => (/natural|neural|online|google/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1);

/** Best installed voice for a BCP-47 tag (exact region first, then same language). */
export function voiceFor(tag: string): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  if (!voices.length) voices = window.speechSynthesis.getVoices();
  const t = tag.toLowerCase();
  const base = t.slice(0, 2);
  const norm = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-');
  const exact = voices.filter((v) => norm(v) === t).sort((a, b) => quality(b) - quality(a));
  if (exact.length) return exact[0];
  const same = voices.filter((v) => norm(v) === base || norm(v).startsWith(base + '-')).sort((a, b) => quality(b) - quality(a));
  return same[0] ?? null;
}

export const hasVoice = (tag: string) => voiceFor(tag) != null;

/** Which reminder languages this browser can actually speak, with the voice it will use. */
export async function voiceReport(tags: Record<string, string>) {
  await whenVoicesReady();
  return Object.fromEntries(Object.entries(tags).map(([code, tag]) => [code, voiceFor(tag)?.name ?? null])) as Record<string, string | null>;
}

/**
 * Speak several sentences one after another, each in its own language (e.g. Kannada, then English).
 * Languages without a voice on this device are skipped (their text is shown on screen instead) and returned.
 */
export async function speakSequence(items: { text: string; tag: string }[]): Promise<string[]> {
  if (!('speechSynthesis' in window) || !items.length) return items.map((i) => i.tag);
  await whenVoicesReady();
  const playable = items.filter((it) => hasVoice(it.tag) || it.tag.startsWith('en'));
  const missing = items.filter((it) => !playable.includes(it)).map((it) => it.tag);
  missing.forEach(warnMissingVoice);
  window.speechSynthesis.cancel();
  if (!playable.length) return missing;
  await new Promise<void>((resolve) => {
    // Chrome drops an utterance queued in the same tick as cancel(), so start on the next tick.
    setTimeout(() => {
      playable.forEach((it, i) => {
        const u = new SpeechSynthesisUtterance(it.text);
        u.lang = it.tag;
        u.rate = 0.88;
        const v = voiceFor(it.tag);
        if (v) u.voice = v;
        if (i === playable.length - 1) {
          u.onend = () => resolve();
          u.onerror = () => resolve();
        }
        window.speechSynthesis.speak(u);
      });
    }, 60);
    setTimeout(resolve, 15000 * playable.length); // safety net: some browsers never fire onend
  });
  return missing;
}
