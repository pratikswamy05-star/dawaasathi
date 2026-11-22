import { ArrowLeft, Phone, Printer, Save, Share2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorText } from '../api/client';
import { Button, Card, ErrorState, Spinner } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useT } from '../i18n';
import { QrCode } from '../lib/qr';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import type { EmergencyCardData } from '../types';

/** Plain text stored INSIDE the QR code, so any phone camera can read it offline. */
function cardText(d: EmergencyCardData) {
  const p = d.patient;
  const lines = [
    'DAWAASATHI EMERGENCY CARD',
    `${p.name}${p.age ? `, ${p.age}` : ''}${p.gender ? ` ${p.gender}` : ''}${p.village ? `, ${p.village}` : ''}`,
    p.bloodGroup ? `Blood group: ${p.bloodGroup}` : '',
    `Allergies: ${p.allergies || 'not recorded'}`,
    p.conditions.length ? `Conditions: ${p.conditions.join(', ')}` : '',
    'Medicines:',
    ...d.medicines.map((m) => `- ${m.name}${m.dosage ? ` ${m.dosage}` : ''} at ${m.times.join(', ')}${m.food ? ` (${m.food})` : ''}`),
    ...d.latestReadings.map((r) => `Last ${r.kind.startsWith('sugar') ? 'sugar' : 'BP'}: ${r.display}`),
    ...d.contacts.map((c) => `${c.role}: ${c.name}${c.phone ? ` ${c.phone}` : ''}`),
    p.notes ? `Note: ${p.notes}` : '',
    'Emergency: 108',
  ];
  return lines.filter(Boolean).join('\n');
}

function QrSvg({ text }: { text: string }) {
  const qr = useMemo(() => QrCode.encodeText(text, 'M'), [text]);
  const n = qr.size + 8;
  return (
    <svg viewBox={`0 0 ${n} ${n}`} className="h-full w-full" shapeRendering="crispEdges" role="img" aria-label="QR code with the emergency details">
      <rect width={n} height={n} fill="#ffffff" />
      <path d={qr.toPath(4)} fill="#0d1b33" />
    </svg>
  );
}

function EditForm({ d, onSaved }: { d: EmergencyCardData; onSaved: () => void }) {
  const [bloodGroup, setBloodGroup] = useState(d.patient.bloodGroup ?? '');
  const [allergies, setAllergies] = useState(d.patient.allergies ?? '');
  const [notes, setNotes] = useState(d.patient.notes ?? '');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/patients/${d.patient.id}/emergency-card`, { method: 'PUT', body: { bloodGroup, allergies, notes } });
      toast.success('Emergency card updated');
      onSaved();
    } catch (er) {
      toast.error(errorText(er));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Update card details" className="no-print">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3" noValidate>
        <label>
          <span className="label">Blood group</span>
          <select className="input" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)}>
            <option value="">Not known</option>
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-2">
          <span className="label">Allergies</span>
          <input className="input" maxLength={200} value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="e.g. Penicillin, or None known" />
        </label>
        <label className="sm:col-span-3">
          <span className="label">Other note for emergencies (optional)</span>
          <input className="input" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Hard of hearing, uses a walking stick" />
        </label>
        <Button type="submit" loading={busy}>
          <Save className="h-4 w-4" aria-hidden /> Save
        </Button>
      </form>
    </Card>
  );
}

/** Printable / shareable emergency health card with an offline QR code. */
export default function EmergencyCard() {
  const { t } = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const me = useAuth((s) => s.user!);
  const patientId = id ?? String(me.patientId ?? '');
  const { data, loading, error, reload } = useApi<EmergencyCardData>(patientId ? `/patients/${patientId}/emergency-card` : null);

  if (!patientId) return <ErrorState message="No patient selected" />;
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  const p = data.patient;
  const text = cardText(data);

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: `Emergency card — ${p.name}`, text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success('Card text copied — paste it in WhatsApp');
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="no-print flex flex-wrap items-center gap-2">
        {id && (
          <button onClick={() => nav(-1)} className="flex items-center gap-1 font-semibold text-navy-600 hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </button>
        )}
        <h1 className="text-3xl font-extrabold">🆘 {t('emergencyCard')}</h1>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={() => void share()}>
            <Share2 className="h-5 w-5" aria-hidden /> Share
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="h-5 w-5" aria-hidden /> Print
          </Button>
        </div>
      </div>
      <p className="no-print text-lg text-slate-600">{t('emergencyCardHelp')}</p>

      <article id="print-area" className="print-break overflow-hidden rounded-[1.75rem] border-4 border-bad-600 bg-white shadow-lift">
        <header className="flex items-center justify-between bg-gradient-to-r from-bad-700 to-bad-500 px-6 py-3 text-white">
          <p className="text-xl font-black tracking-wide">🆘 EMERGENCY HEALTH CARD</p>
          <p className="font-bold">DawaaSathi</p>
        </header>
        <div className="grid gap-6 p-6 sm:grid-cols-[1fr_230px]">
          <div className="space-y-3">
            <div>
              <p className="text-3xl font-black text-navy-900">{p.name}</p>
              <p className="text-lg text-slate-600">
                {[p.age && `${p.age} y`, p.gender, p.village].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-xl bg-bad-50 px-3 py-1 text-lg font-extrabold text-bad-700">🩸 {p.bloodGroup ?? 'Blood group ?'}</span>
              <span className="rounded-xl bg-warn-50 px-3 py-1 text-lg font-bold text-warn-700">⚠ Allergies: {p.allergies || 'not recorded'}</span>
              {p.conditions.map((c) => (
                <span key={c} className="rounded-xl bg-navy-50 px-3 py-1 text-lg font-bold text-navy-800">
                  {c}
                </span>
              ))}
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Current medicines</p>
              <ul className="mt-1 space-y-1">
                {data.medicines.map((m) => (
                  <li key={m.name} className="text-lg">
                    💊 <b>{m.name}</b> {m.dosage} <span className="text-slate-600">· {m.times.join(', ')}{m.food ? ` · ${m.food}` : ''}</span>
                  </li>
                ))}
                {!data.medicines.length && <li className="text-slate-500">No active medicines</li>}
              </ul>
            </div>
            {data.latestReadings.length > 0 && (
              <p className="text-slate-700">
                <b>Last readings:</b> {data.latestReadings.map((r) => r.display).join(' · ')}
              </p>
            )}
            {p.notes && <p className="rounded-xl bg-slate-50 p-2 text-slate-700">📝 {p.notes}</p>}
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="aspect-square w-[210px] rounded-xl border-2 border-slate-200 p-1">
              <QrSvg text={text} />
            </div>
            <p className="text-center text-xs font-semibold text-slate-500">Scan with any phone camera · works offline</p>
          </div>
        </div>
        <footer className="grid gap-2 border-t-2 border-dashed border-slate-200 bg-slate-50 px-6 py-4 sm:grid-cols-2">
          {data.contacts.map((c) => (
            <p key={c.role} className="text-lg">
              <span className="text-sm font-bold uppercase text-slate-500">{c.role}</span>
              <br />
              <b>{c.name}</b>{' '}
              {c.phone && (
                <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 font-bold text-navy-600">
                  <Phone className="h-4 w-4" aria-hidden /> {c.phone}
                </a>
              )}
            </p>
          ))}
          <p className="text-lg">
            <span className="text-sm font-bold uppercase text-slate-500">Ambulance</span>
            <br />
            <a href="tel:108" className="text-2xl font-black text-bad-700">
              📞 108
            </a>
          </p>
        </footer>
      </article>

      <EditForm d={data} onSaved={() => void reload()} />
      <p className="no-print text-sm text-slate-500">Dummy demo data. The QR code holds only the text on this card — nothing is sent to the internet.</p>
    </div>
  );
}
