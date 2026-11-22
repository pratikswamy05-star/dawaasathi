import { MessageCircle } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { dateTimeOf } from '../lib/format';
import { Badge, Card } from './ui';

interface WaMessage {
  id: number;
  patientId: number;
  patientName: string;
  toName: string | null;
  phone: string;
  body: string;
  reason: string;
  status: 'preview' | 'sent' | 'failed';
  error: string | null;
  createdAt: string;
  waUrl: string;
}
interface WaData { mode: 'twilio' | 'demo'; rule: { threshold: number; hours: number }; messages: WaMessage[] }

/** WhatsApp messages sent to the family when a patient misses more than 2 doses. */
export default function WhatsAppAlerts({ patientId }: { patientId?: number }) {
  const { data } = useApi<WaData>(`/whatsapp${patientId ? `?patientId=${patientId}` : ''}`, { poll: 30_000 });
  if (!data) return null;
  const { mode, rule, messages } = data;
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-[#25D366]" aria-hidden /> WhatsApp alerts
        </span>
      }
      action={<Badge tone={mode === 'twilio' ? 'green' : 'amber'}>{mode === 'twilio' ? 'Auto-send on' : 'Demo: tap to send'}</Badge>}
    >
      <p className="mb-3 text-slate-600">
        A WhatsApp message goes to the family when more than {rule.threshold - 1} doses are missed within {rule.hours} hours.
      </p>
      {!messages.length ? (
        <p className="rounded-xl bg-ok-50 p-3 font-semibold text-ok-700">✅ No repeated missed doses — no WhatsApp alerts.</p>
      ) : (
        <ul className="space-y-3">
          {messages.slice(0, 5).map((m) => (
            <li key={m.id} className="rounded-2xl border-2 border-[#25D366]/40 bg-[#e7fbe9] p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <b className="text-navy-900">{m.patientName}</b>
                <span className="text-slate-600">→ {m.toName ?? 'Family'} ({m.phone})</span>
                <span className="text-slate-500">· {dateTimeOf(m.createdAt)}</span>
                <Badge tone={m.status === 'sent' ? 'green' : m.status === 'failed' ? 'red' : 'amber'}>
                  {m.status === 'sent' ? '✓✓ Sent' : m.status === 'failed' ? 'Not sent' : 'Ready'}
                </Badge>
              </div>
              <p className="whitespace-pre-line rounded-xl bg-white p-3 text-[15px] leading-snug text-slate-800 shadow-sm">{m.body.replace(/\*/g, '')}</p>
              {m.status !== 'sent' && (
                <a
                  href={m.waUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#25D366] px-4 font-bold text-white transition hover:-translate-y-0.5"
                >
                  <MessageCircle className="h-5 w-5" aria-hidden /> Send on WhatsApp
                </a>
              )}
              {m.error && <p className="mt-1 text-sm text-bad-700">Error: {m.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
