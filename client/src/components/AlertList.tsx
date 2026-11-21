import { BellRing, Check, CheckCheck, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../api/client';
import { dateTimeOf } from '../lib/format';
import { toast } from '../store/toast';
import type { Alert } from '../types';
import MessagePreview from './MessagePreview';
import { Badge, Button, EmptyState } from './ui';

const TYPE_LABEL: Record<Alert['type'], string> = {
  missed_dose: 'Missed dose',
  repeated_miss: 'Repeated misses',
  refill: 'Refill',
  conflict: 'Prescription warning',
  help: 'HELP pressed',
  vitals: 'Health reading',
  teleconsult: 'Doctor call',
};

/** Alerts with acknowledge / resolve actions. */
export default function AlertList({ alerts, onChanged, showPatient = true }: { alerts: Alert[]; onChanged: () => void; showPatient?: boolean }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  if (!alerts.length) return <EmptyState title="No alerts" />;

  const act = async (id: number, action: 'ack' | 'resolve') => {
    setBusy(id);
    try {
      await api(`/alerts/${id}/${action}`, { method: 'POST' });
      toast.success(action === 'ack' ? 'Alert acknowledged' : 'Alert resolved');
      onChanged();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ul className="space-y-3">
      {alerts.map((a) => (
        <li
          key={a.id}
          className={`rounded-xl border-l-8 border border-slate-200 p-4 ${a.severity === 'high' ? 'border-l-bad-600' : a.severity === 'medium' ? 'border-l-warn-600' : 'border-l-navy-600'} ${a.status === 'resolved' ? 'opacity-60' : ''}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <BellRing className="h-5 w-5 text-navy-600" aria-hidden />
            <Badge tone={a.severity === 'high' ? 'red' : a.severity === 'medium' ? 'amber' : 'navy'}>{TYPE_LABEL[a.type]}</Badge>
            {showPatient && a.patient_name && (
              <Link to={`/patients/${a.patient_id}`} className="font-bold text-navy-800 hover:underline">
                {a.patient_name}
              </Link>
            )}
            <span className="ml-auto text-sm text-slate-500">{dateTimeOf(a.created_at)}</span>
          </div>
          <p className="mt-2">{a.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={a.status === 'open' ? 'red' : a.status === 'acknowledged' ? 'amber' : 'green'}>{a.status}</Badge>
            {a.status === 'open' && (
              <Button variant="secondary" onClick={() => act(a.id, 'ack')} loading={busy === a.id}>
                <Check className="h-4 w-4" aria-hidden /> Acknowledge
              </Button>
            )}
            {a.status !== 'resolved' && (
              <Button variant="ghost" onClick={() => act(a.id, 'resolve')} disabled={busy === a.id}>
                <CheckCheck className="h-4 w-4" aria-hidden /> Resolve
              </Button>
            )}
            <Button variant="ghost" onClick={() => setPreview(preview === a.id ? null : a.id)} aria-expanded={preview === a.id}>
              <MessageSquare className="h-4 w-4" aria-hidden /> {preview === a.id ? 'Hide message' : 'SMS / WhatsApp'}
            </Button>
          </div>
          {preview === a.id && <MessagePreview alertId={a.id} />}
        </li>
      ))}
    </ul>
  );
}
