import { CalendarClock, CheckCircle2, Video, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../api/client';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useT } from '../i18n';
import { dateTimeOf } from '../lib/format';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import type { PatientSummary, Teleconsult } from '../types';

const STATUS_TONE = { requested: 'amber', confirmed: 'green', completed: 'navy', cancelled: 'slate' } as const;
const STATUS_TEXT = { requested: 'Waiting for doctor', confirmed: 'Call booked', completed: 'Done', cancelled: 'Cancelled' };

/** Local "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function RequestForm({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const role = useAuth((s) => s.user!.role);
  const needsPatient = role !== 'patient';
  const { data: pts } = useApi<{ patients: PatientSummary[] }>(needsPatient ? '/patients' : null);
  const [patientId, setPatientId] = useState('');
  const [reason, setReason] = useState('');
  const [preferred, setPreferred] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (needsPatient && !patientId) return setErr('Choose the patient');
    if (reason.trim().length < 3) return setErr('Tell the doctor briefly why you need the call');
    setBusy(true);
    try {
      await api('/teleconsults', {
        method: 'POST',
        body: { reason: reason.trim(), patientId: needsPatient ? Number(patientId) : undefined, preferredAt: preferred ? new Date(preferred).toISOString() : undefined },
      });
      toast.success('Request sent to the doctor');
      setReason('');
      setPreferred('');
      onDone();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={<span className="text-xl">📹 {t('requestCall')}</span>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {needsPatient && (
          <label className="block">
            <span className="label">Patient</span>
            <select className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              <option value="">Choose…</option>
              {pts?.patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="label">Why do you need the doctor?</span>
          <textarea className="input min-h-[96px] py-3" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Sugar is high for 3 days, feeling tired" />
        </label>
        <label className="block">
          <span className="label">Preferred time (optional)</span>
          <input type="datetime-local" className="input" min={toLocalInput(new Date())} value={preferred} onChange={(e) => setPreferred(e.target.value)} />
        </label>
        {err && (
          <p className="field-error text-base" role="alert">
            {err}
          </p>
        )}
        <Button type="submit" size="lg" loading={busy}>
          <Video aria-hidden /> Send request
        </Button>
        <p className="text-sm text-slate-500">The ASHA worker can help you join the call on her phone. For emergencies call 108 — do not wait for the video call.</p>
      </form>
    </Card>
  );
}

function DoctorActions({ tc, onDone }: { tc: Teleconsult; onDone: () => void }) {
  const [when, setWhen] = useState(() => toLocalInput(tc.preferred_at && new Date(tc.preferred_at) > new Date() ? new Date(tc.preferred_at) : new Date(Date.now() + 2 * 3600e3)));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const update = async (status: 'confirmed' | 'completed' | 'cancelled') => {
    setBusy(true);
    try {
      await api(`/teleconsults/${tc.id}`, {
        method: 'PATCH',
        body: { status, scheduledAt: status === 'confirmed' ? new Date(when).toISOString() : undefined, doctorNote: note.trim() || undefined },
      });
      toast.success(status === 'confirmed' ? 'Call booked — patient, caregiver and ASHA informed' : status === 'completed' ? 'Marked as done' : 'Cancelled');
      onDone();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (tc.status === 'requested')
    return (
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label>
          <span className="label">Call time</span>
          <input type="datetime-local" className="input" value={when} min={toLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <Button onClick={() => update('confirmed')} loading={busy}>
          <CalendarClock className="h-4 w-4" aria-hidden /> Confirm call
        </Button>
        <Button variant="ghost" onClick={() => update('cancelled')} disabled={busy}>
          <XCircle className="h-4 w-4" aria-hidden /> Decline
        </Button>
      </div>
    );
  if (tc.status === 'confirmed')
    return (
      <div className="mt-3 space-y-2">
        <input className="input" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the patient / ASHA after the call (optional)" />
        <Button variant="success" onClick={() => update('completed')} loading={busy}>
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Mark call done
        </Button>
      </div>
    );
  return null;
}

export default function Teleconsults() {
  const { t } = useT();
  const user = useAuth((s) => s.user!);
  const isDoctor = user.role === 'doctor' || user.role === 'admin';
  const { data, loading, error, reload } = useApi<{ teleconsults: Teleconsult[] }>('/teleconsults', { poll: 30_000 });

  const cancel = async (id: number) => {
    try {
      await api(`/teleconsults/${id}`, { method: 'PATCH', body: { status: 'cancelled' } });
      toast.success('Request cancelled');
      void reload();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title={`📹 ${t('doctorCall')}`}
        subtitle={isDoctor ? 'Video consultation requests from your patients, caregivers and ASHA workers.' : 'Talk to the PHC doctor by video without travelling.'}
      />
      {!isDoctor && <RequestForm onDone={() => void reload()} />}

      <Card title={isDoctor ? 'Requests & booked calls' : 'My requests'}>
        {loading && !data ? (
          <Spinner />
        ) : error && !data ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : !data?.teleconsults.length ? (
          <EmptyState title="No consultations yet" />
        ) : (
          <ul className="space-y-3">
            {data.teleconsults.map((tc) => (
              <li
                key={tc.id}
                className={`rounded-xl border border-l-8 border-slate-200 p-4 ${tc.status === 'confirmed' ? 'border-l-ok-600' : tc.status === 'requested' ? 'border-l-warn-600' : 'border-l-slate-300 opacity-80'}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONE[tc.status]}>{STATUS_TEXT[tc.status]}</Badge>
                  {user.role === 'patient' ? (
                    <span className="font-bold">{tc.doctor_name}</span>
                  ) : (
                    <Link to={`/patients/${tc.patient_id}`} className="font-bold text-navy-800 hover:underline">
                      {tc.patient_name}
                      {tc.village ? ` · ${tc.village}` : ''}
                    </Link>
                  )}
                  <span className="ml-auto text-sm text-slate-500">asked {dateTimeOf(tc.created_at)}</span>
                </div>
                <p className="mt-2 text-lg">{tc.reason}</p>
                <p className="mt-1 text-sm text-slate-600">
                  Requested by {tc.requested_by_name ?? '—'}
                  {tc.preferred_at && ` · prefers ${dateTimeOf(tc.preferred_at)}`}
                </p>
                {tc.scheduled_at && tc.status !== 'cancelled' && (
                  <p className="mt-2 flex items-center gap-2 text-xl font-bold text-ok-700">
                    <CalendarClock aria-hidden /> {dateTimeOf(tc.scheduled_at)}
                  </p>
                )}
                {tc.doctor_note && <p className="mt-2 rounded-lg bg-navy-50 p-3">🩺 Doctor's note: {tc.doctor_note}</p>}
                {tc.joinUrl && (
                  <a
                    href={tc.joinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex min-h-[56px] items-center gap-2 rounded-xl bg-ok-600 px-6 text-xl font-bold text-white hover:bg-ok-700"
                  >
                    <Video aria-hidden /> {t('joinCall')}
                  </a>
                )}
                {isDoctor && <DoctorActions tc={tc} onDone={() => void reload()} />}
                {!isDoctor && tc.status === 'requested' && tc.requested_by === user.id && (
                  <Button variant="ghost" className="mt-2" onClick={() => cancel(tc.id)}>
                    Cancel request
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-slate-500">Video calls open in Jitsi Meet (free, works in the browser — no app or account needed).</p>
      </Card>
    </div>
  );
}
