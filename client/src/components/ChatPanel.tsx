import { Bot, Mic, Phone, Send, ShieldAlert, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, errorText } from '../api/client';
import { useT, type TKey } from '../i18n';
import { useOnline } from '../lib/offline';
import { listenText, speak, voiceInputSupported } from '../lib/speech';
import { Button } from './ui';

export interface ChatReply {
  intent: string;
  text: string;
  lines: string[];
  emergency: boolean;
  disclaimer: string;
}

type Msg = { id: number; from: 'user'; text: string } | { id: number; from: 'bot'; reply: ChatReply } | { id: number; from: 'error'; text: string };

const CHIPS: TKey[] = ['chipToday', 'chipNext', 'chipStock', 'chipMissed'];
let seq = 1;

/** Medicine-information chat. Questions go to the server (no AI keys in the browser). Every answer carries the disclaimer. */
export default function ChatPanel({ patientId }: { patientId?: number | null }) {
  const { t, lang } = useT();
  const online = useOnline();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [msgs]);

  const ask = async (raw: string, spoken = false) => {
    const text = raw.trim().slice(0, 300);
    if (!text || busy) return;
    setInput('');
    setMsgs((m) => [...m, { id: seq++, from: 'user', text }]);
    setBusy(true);
    try {
      const { reply } = await api<{ reply: ChatReply }>('/chat', { method: 'POST', body: { message: text, lang, ...(patientId ? { patientId } : {}) } });
      setMsgs((m) => [...m, { id: seq++, from: 'bot', reply }]);
      // Spoken questions get spoken answers; emergencies are always read out.
      if (spoken || reply.emergency) speak([reply.text, ...reply.lines].join('. '), lang);
    } catch (e) {
      setMsgs((m) => [...m, { id: seq++, from: 'error', text: errorText(e) }]);
    } finally {
      setBusy(false);
    }
  };

  const voice = async () => {
    setListening(true);
    const heard = await listenText(lang);
    setListening(false);
    if (heard) void ask(heard, true);
  };

  return (
    <div className="flex min-h-[60vh] flex-col gap-4">
      <p className="rounded-xl bg-navy-50 p-4 text-lg text-navy-800">{t('askIntro')}</p>

      {!online && (
        <p className="rounded-xl bg-warn-50 p-3 font-semibold text-warn-700" role="status">
          {t('chatOffline')}
        </p>
      )}

      <div className="flex-1 space-y-3" aria-live="polite">
        {msgs.map((m) =>
          m.from === 'user' ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-navy-800 px-4 py-3 text-lg text-white">{m.text}</p>
            </div>
          ) : m.from === 'error' ? (
            <p key={m.id} className="rounded-xl bg-bad-50 p-3 font-semibold text-bad-700" role="alert">
              {m.text}
            </p>
          ) : (
            <div key={m.id} className="flex gap-2">
              <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-100 text-navy-800" aria-hidden>
                <Bot className="h-5 w-5" />
              </div>
              <div className={`max-w-[90%] rounded-2xl rounded-tl-sm border p-4 ${m.reply.emergency ? 'border-bad-600 bg-bad-50' : 'border-slate-200 bg-white'}`}>
                <p className={`flex items-start gap-2 text-lg ${m.reply.emergency || m.reply.intent === 'refusal' ? 'font-bold' : 'font-semibold'}`}>
                  {(m.reply.emergency || m.reply.intent === 'refusal') && <ShieldAlert className="mt-1 h-5 w-5 shrink-0 text-bad-600" aria-hidden />}
                  {m.reply.text}
                </p>
                {m.reply.lines.length > 0 && (
                  <ul className="mt-2 space-y-1 text-lg">
                    {m.reply.lines.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                )}
                {m.reply.emergency && (
                  <a href="tel:108" className="mt-3 inline-flex min-h-[60px] w-full items-center justify-center gap-2 rounded-xl bg-bad-600 text-xl font-bold text-white">
                    <Phone aria-hidden /> {t('call108')}
                  </a>
                )}
                <button
                  onClick={() => speak([m.reply.text, ...m.reply.lines].join('. '), lang)}
                  className="mt-2 inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 font-semibold text-navy-600 hover:bg-navy-50"
                >
                  <Volume2 className="h-5 w-5" aria-hidden /> {t('readAloud')}
                </button>
                <p className="mt-2 border-t border-slate-200 pt-2 text-sm font-medium text-slate-500">⚠️ {m.reply.disclaimer}</p>
              </div>
            </div>
          ),
        )}
        {busy && <p className="pl-11 text-slate-500">…</p>}
        <div ref={endRef} />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested questions">
        {CHIPS.map((k) => (
          <button
            key={k}
            onClick={() => void ask(t(k))}
            disabled={busy || !online}
            className="min-h-[48px] rounded-full border-2 border-navy-600/30 bg-white px-4 text-left font-semibold text-navy-800 hover:bg-navy-50 disabled:opacity-50"
          >
            {t(k)}
          </button>
        ))}
      </div>

      <form
        className="sticky bottom-20 flex gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-soft md:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          {t('askPlaceholder')}
        </label>
        <input
          id="chat-input"
          className="input flex-1 border-0 text-lg focus:ring-0"
          value={input}
          maxLength={300}
          placeholder={t('askPlaceholder')}
          onChange={(e) => setInput(e.target.value)}
          disabled={!online}
        />
        {voiceInputSupported() && (
          <Button type="button" variant="secondary" onClick={voice} disabled={listening || busy || !online} aria-label={t('speakQuestion')}>
            <Mic aria-hidden /> <span className="hidden sm:inline">{listening ? '…' : t('speakQuestion')}</span>
          </Button>
        )}
        <Button type="submit" loading={busy} disabled={!online || !input.trim()} aria-label={t('send')}>
          <Send aria-hidden />
        </Button>
      </form>
    </div>
  );
}
