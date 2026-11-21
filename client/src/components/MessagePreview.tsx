import { MessageSquare, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, errorText } from '../api/client';
import type { MessageRecipient } from '../types';
import { Spinner } from './ui';

const ROLE: Record<string, string> = { caregiver: 'Caregiver', asha: 'ASHA worker', doctor: 'Doctor', patient: 'Patient' };

/** Phone-style preview of the SMS / WhatsApp the alert would send, with one-tap "send" links (no API keys needed). */
export default function MessagePreview({ alertId }: { alertId: number }) {
  const [data, setData] = useState<MessageRecipient[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api<{ recipients: MessageRecipient[] }>(`/alerts/${alertId}/message`)
      .then((r) => live && setData(r.recipients))
      .catch((e) => live && setErr(errorText(e)));
    return () => {
      live = false;
    };
  }, [alertId]);

  if (err) return <p className="mt-3 text-bad-700">{err}</p>;
  if (!data) return <Spinner small label="Preparing message…" />;
  if (!data.length) return <p className="mt-3 text-slate-600">No one with a phone number is linked for this alert yet.</p>;

  return (
    <div className="mt-3 grid gap-4 md:grid-cols-2">
      {data.map((r) => (
        <div key={r.phone + r.role} className="mx-auto w-full max-w-xs rounded-[2rem] border-4 border-slate-800 bg-slate-800 p-2 shadow-lg">
          <div className="rounded-[1.5rem] bg-[#e5ddd5] p-3">
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-[#075e54] px-3 py-2 text-white">
              <Smartphone className="h-4 w-4" aria-hidden />
              <div className="leading-tight">
                <p className="text-sm font-bold">{r.name}</p>
                <p className="text-xs opacity-80">
                  {ROLE[r.role] ?? r.role} · +91 {r.phone}
                </p>
              </div>
            </div>
            <div className="ml-auto w-[92%] whitespace-pre-line rounded-xl rounded-tr-none bg-[#dcf8c6] p-3 text-sm text-slate-900 shadow">
              {r.text}
              <p className="mt-1 text-right text-[10px] text-slate-500">now ✓✓</p>
            </div>
            <p className="mt-2 text-center text-[11px] text-slate-600">
              {r.text.length} characters · {r.smsParts} SMS part{r.smsParts > 1 ? 's' : ''} · language: {r.language.toUpperCase()}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <a href={r.whatsappUrl} target="_blank" rel="noreferrer" className="flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-[#25d366] text-sm font-bold text-white">
                <MessageSquare className="h-4 w-4" aria-hidden /> WhatsApp
              </a>
              <a href={r.smsUrl} className="flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-navy-800 text-sm font-bold text-white">
                <Smartphone className="h-4 w-4" aria-hidden /> SMS
              </a>
            </div>
          </div>
        </div>
      ))}
      <p className="text-sm text-slate-500 md:col-span-2">
        Preview of what the automatic SMS / WhatsApp would say. In this prototype the buttons open WhatsApp or your SMS app with the text ready — a real
        deployment would send it through an SMS gateway on the server.
      </p>
    </div>
  );
}
