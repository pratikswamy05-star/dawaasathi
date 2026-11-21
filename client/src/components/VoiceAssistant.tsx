import { Keyboard, LifeBuoy, Mic, Phone, Send, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorText } from '../api/client';
import { useT } from '../i18n';
import { listenText, speak, voiceInputSupported } from '../lib/speech';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import type { Lang } from '../types';

type Action = { type: 'call'; tel: string; name: string } | { type: 'confirm_help' } | { type: 'navigate'; to: string } | { type: 'refresh' } | null;

interface Turn {
  id: number;
  who: 'me' | 'saathi';
  text: string;
  lines?: string[];
  emergency?: boolean;
  ai?: boolean;
  action?: Action;
}

const UI: Record<Lang, { title: string; hint: string; listening: string; thinking: string; tap: string; type: string; examples: string[]; sendHelp: string; noMic: string }> = {
  en: {
    title: 'Saathi — voice assistant',
    hint: 'Tap the mic and speak. You can say:',
    listening: 'Listening… speak now',
    thinking: 'Thinking…',
    tap: 'Tap to speak',
    type: 'Or type here…',
    examples: ['I took my medicine', 'My BP is 130 over 85', 'When is my next medicine?', 'Call my son', 'Open reminders', 'How many tablets are left?'],
    sendHelp: 'Yes, send HELP alert',
    noMic: 'Voice input needs Chrome or Edge. You can type instead.',
  },
  kn: {
    title: 'ಸಾಥಿ — ಧ್ವನಿ ಸಹಾಯಕ',
    hint: 'ಮೈಕ್ ಒತ್ತಿ ಮಾತನಾಡಿ. ಉದಾಹರಣೆ:',
    listening: 'ಕೇಳುತ್ತಿದ್ದೇನೆ… ಈಗ ಮಾತನಾಡಿ',
    thinking: 'ಯೋಚಿಸುತ್ತಿದ್ದೇನೆ…',
    tap: 'ಮಾತನಾಡಲು ಒತ್ತಿ',
    type: 'ಅಥವಾ ಇಲ್ಲಿ ಬರೆಯಿರಿ…',
    examples: ['ನಾನು ಔಷಧಿ ತೆಗೆದುಕೊಂಡೆ', 'ನನ್ನ ಬಿಪಿ 130 85', 'ಮುಂದಿನ ಔಷಧಿ ಯಾವಾಗ?', 'ಮಗನಿಗೆ ಕರೆ ಮಾಡಿ', 'ರಿಮೈಂಡರ್ ತೆರೆ', 'ಎಷ್ಟು ಮಾತ್ರೆ ಉಳಿದಿದೆ?'],
    sendHelp: 'ಹೌದು, ಸಹಾಯ ಎಚ್ಚರಿಕೆ ಕಳುಹಿಸಿ',
    noMic: 'ಧ್ವನಿಗೆ Chrome ಅಥವಾ Edge ಬೇಕು. ಬರೆದು ಕೇಳಬಹುದು.',
  },
  hi: {
    title: 'साथी — आवाज़ सहायक',
    hint: 'माइक दबाएँ और बोलें। जैसे:',
    listening: 'सुन रहा हूँ… अब बोलिए',
    thinking: 'सोच रहा हूँ…',
    tap: 'बोलने के लिए दबाएँ',
    type: 'या यहाँ लिखें…',
    examples: ['मैंने दवा ले ली', 'मेरा बीपी 130 बटा 85', 'अगली दवा कब है?', 'बेटे को फोन करो', 'रिमाइंडर खोलो', 'कितनी गोलियाँ बची हैं?'],
    sendHelp: 'हाँ, मदद का अलर्ट भेजें',
    noMic: 'आवाज़ के लिए Chrome या Edge चाहिए। आप लिख भी सकते हैं।',
  },
};

let seq = 1;

/** Floating "Saathi" voice assistant for patients: speak a command or a question, hear the answer. */
export default function VoiceAssistant() {
  const { lang } = useT();
  const patientId = useAuth((s) => s.user?.patientId ?? null);
  const nav = useNavigate();
  const ui = UI[lang] ?? UI.en;
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'listening' | 'thinking'>('idle');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [typed, setTyped] = useState('');
  const [showType, setShowType] = useState(!voiceInputSupported());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [turns, state]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q) return;
    setTurns((t) => [...t.slice(-12), { id: seq++, who: 'me', text: q }]);
    setState('thinking');
    try {
      const r = await api<{ reply: { text: string; lines: string[]; emergency: boolean }; action: Action; ai: boolean }>('/assistant', { method: 'POST', body: { text: q, lang } });
      setTurns((t) => [...t, { id: seq++, who: 'saathi', text: r.reply.text, lines: r.reply.lines, emergency: r.reply.emergency, ai: r.ai, action: r.action }]);
      speak([r.reply.text, ...(r.reply.lines ?? [])].join('. '), lang);
      if (r.action?.type === 'refresh') window.dispatchEvent(new Event('data-synced'));
      if (r.action?.type === 'navigate') {
        const to = r.action.to;
        setTimeout(() => {
          nav(to);
          setOpen(false);
        }, 1400);
      }
    } catch (e) {
      setTurns((t) => [...t, { id: seq++, who: 'saathi', text: errorText(e) }]);
    } finally {
      setState('idle');
    }
  };

  const listen = async () => {
    if (state !== 'idle') return;
    window.speechSynthesis?.cancel();
    setState('listening');
    const heard = await listenText(lang);
    setState('idle');
    if (heard) void ask(heard);
    else toast.info(lang === 'kn' ? 'ಕೇಳಿಸಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.' : lang === 'hi' ? 'सुनाई नहीं दिया। फिर से कोशिश करें।' : "I didn't hear that. Please try again.");
  };

  const sendHelp = async () => {
    if (!patientId) return;
    try {
      await api(`/patients/${patientId}/help`, { method: 'POST' });
      toast.success('HELP alert sent to your family, ASHA worker and doctor.');
      setTurns((t) => [...t, { id: seq++, who: 'saathi', text: '✅ HELP alert sent. Someone will contact you soon. For emergencies call 108.' }]);
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const openAndListen = () => {
    setOpen(true);
    if (voiceInputSupported()) setTimeout(() => void listen(), 250);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(typed);
    setTyped('');
  };

  return (
    <>
      {!open && (
        <button
          onClick={openAndListen}
          className="fixed bottom-44 right-4 z-30 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-navy-800 via-navy-600 to-teal-500 text-white shadow-lift transition hover:scale-110 md:bottom-28"
          aria-label={ui.title}
          title={ui.title}
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-teal-400/40 [animation-duration:2.5s]" aria-hidden />
          <Mic className="relative h-8 w-8" aria-hidden />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={ui.title} onClick={() => setOpen(false)}>
          <div className="flex max-h-[92vh] w-full max-w-lg animate-slide-down flex-col overflow-hidden rounded-t-3xl bg-white shadow-lift sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <header className="hero flex items-center justify-between rounded-none p-4">
              <div className="relative z-10 flex items-center gap-2">
                <Sparkles aria-hidden />
                <p className="text-lg font-extrabold">{ui.title}</p>
              </div>
              <button onClick={() => setOpen(false)} className="relative z-10 rounded-full p-2 hover:bg-white/15" aria-label="Close">
                <X aria-hidden />
              </button>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
              {!turns.length && (
                <div className="animate-fade-in">
                  <p className="mb-2 font-semibold text-slate-600">{ui.hint}</p>
                  <div className="flex flex-wrap gap-2">
                    {ui.examples.map((ex) => (
                      <button key={ex} onClick={() => void ask(ex)} className="rounded-full border border-slate-200 bg-navy-50 px-3 py-2 text-left font-semibold text-navy-800 transition hover:-translate-y-0.5 hover:border-teal-500">
                        “{ex}”
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {turns.map((t) => (
                <div key={t.id} className={`flex animate-fade-in-up ${t.who === 'me' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-lg ${
                      t.who === 'me'
                        ? 'rounded-br-sm bg-gradient-to-r from-navy-800 to-teal-600 text-white'
                        : t.emergency
                          ? 'rounded-bl-sm border-2 border-bad-600 bg-bad-50 text-bad-700'
                          : 'rounded-bl-sm bg-slate-100 text-navy-900'
                    }`}
                  >
                    {t.ai && <span className="mb-1 inline-block rounded-full bg-teal-100 px-2 text-xs font-bold text-teal-700">✨ AI</span>}
                    <p>{t.text}</p>
                    {t.lines?.length ? (
                      <ul className="mt-1 list-disc pl-5 text-base">
                        {t.lines.map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                      </ul>
                    ) : null}
                    {t.action?.type === 'call' && (
                      <a href={`tel:${t.action.tel}`} className={`mt-3 flex min-h-[52px] items-center justify-center gap-2 rounded-xl font-bold text-white ${t.action.tel === '108' ? 'bg-bad-600' : 'bg-ok-600'}`}>
                        <Phone aria-hidden /> {t.action.tel === '108' ? '108' : t.action.name}
                      </a>
                    )}
                    {t.action?.type === 'confirm_help' && (
                      <button onClick={() => void sendHelp()} className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-bad-600 font-bold text-white">
                        <LifeBuoy aria-hidden /> {ui.sendHelp}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {state === 'thinking' && (
                <div className="flex gap-1 px-2" aria-label={ui.thinking}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-3 w-3 animate-bounce rounded-full bg-teal-500" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              )}
              <div ref={endRef} />
            </div>

            <footer className="border-t border-slate-100 p-4">
              {voiceInputSupported() ? (
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={() => void listen()}
                    disabled={state !== 'idle'}
                    className={`relative flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lift transition ${
                      state === 'listening' ? 'scale-110 bg-bad-600' : 'bg-gradient-to-br from-navy-800 to-teal-500 hover:scale-105'
                    } disabled:opacity-90`}
                    aria-label={ui.tap}
                  >
                    {state === 'listening' && <span className="absolute inset-0 animate-ping rounded-full bg-bad-500/50" aria-hidden />}
                    <Mic className="relative h-9 w-9" aria-hidden />
                  </button>
                  <p className="font-semibold text-slate-600">{state === 'listening' ? ui.listening : state === 'thinking' ? ui.thinking : ui.tap}</p>
                  {state === 'listening' && (
                    <div className="flex h-6 items-end gap-1" aria-hidden>
                      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                        <span key={i} className="w-1.5 animate-bounce rounded-full bg-teal-500" style={{ height: `${8 + ((i * 7) % 16)}px`, animationDelay: `${i * 90}ms` }} />
                      ))}
                    </div>
                  )}
                  <button onClick={() => setShowType((s) => !s)} className="flex items-center gap-1 text-sm font-semibold text-navy-600">
                    <Keyboard className="h-4 w-4" aria-hidden /> {ui.type.replace('…', '')}
                  </button>
                </div>
              ) : (
                <p className="mb-2 text-sm text-warn-700">{ui.noMic}</p>
              )}
              {showType && (
                <form onSubmit={submit} className="mt-3 flex gap-2">
                  <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={ui.type} maxLength={300} aria-label={ui.type} />
                  <button type="submit" className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-navy-800 text-white" aria-label="Send">
                    <Send aria-hidden />
                  </button>
                </form>
              )}
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
