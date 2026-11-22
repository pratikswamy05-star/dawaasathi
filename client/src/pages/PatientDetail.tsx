import { ArrowLeft, FileText, HeartPulse, Phone, PhoneCall, Printer, Video } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorText } from '../api/client';
import DoseCard from '../components/DoseCard';
import { AdherenceChart, ConflictList, DoseBars, SafetyScoreCard, StockList } from '../components/Insights';
import PrescriptionForm from '../components/PrescriptionForm';
import RefillForm from '../components/RefillForm';
import VitalsPanel from '../components/VitalsPanel';
import { Badge, Button, Card, ErrorState, PageHeader, Spinner } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useConfirmDose } from '../hooks/useConfirmDose';
import { FREQ_LABEL, pctText } from '../lib/format';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import type { Overview } from '../types';

/** One patient, for caregivers, ASHA workers, doctors and admins. The API decides who may open it. */
export default function PatientDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const role = useAuth((s) => s.user!.role);
  const user = useAuth((s) => s.user!);
  const { data, loading, error, reload } = useApi<Overview>(`/patients/${id}`, { poll: 60_000 });
  const { confirm, busyId } = useConfirmDose(() => void reload());
  const [showForm, setShowForm] = useState(false);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error.status === 403 ? 'You do not have access to this patient.' : error.message} onRetry={reload} />;
  if (!data) return null;

  const p = data.patient;
  const canPrescribe = role === 'doctor' || role === 'asha' || role === 'admin';
  const canConfirm = role === 'caregiver' || role === 'asha' || role === 'admin';

  const stop = async (rxId: number) => {
    if (!window.confirm('Stop this prescription? Future doses will be removed from the schedule.')) return;
    try {
      await api(`/prescriptions/${rxId}/stop`, { method: 'POST' });
      toast.success('Prescription stopped');
      void reload();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div className="space-y-5">
      <button onClick={() => nav(-1)} className="flex items-center gap-1 font-semibold text-navy-600 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </button>
      <PageHeader
        title={
          <>
            {p.name}{' '}
            <span className="text-xl font-medium text-slate-500">
              {p.age ? `${p.age} y` : ''} {p.gender ?? ''}
            </span>
          </>
        }
        subtitle={`${p.village ?? ''} · ${p.conditions.join(' + ') || 'No conditions recorded'}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link to={`/patients/${p.id}/report`} className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-navy-800 px-4 font-bold text-white hover:bg-navy-700">
              <Printer aria-hidden /> Weekly report (PDF)
            </Link>
            <Link
              to={`/patients/${p.id}/card`}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-bad-600 px-4 font-bold text-bad-700 hover:bg-bad-50"
            >
              🆘 Emergency card
            </Link>
            <Link
              to={`/${role === 'admin' ? 'doctor' : role}/reminders?patient=${p.id}`}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-navy-800 px-4 font-bold text-navy-800 hover:bg-navy-50"
            >
              <PhoneCall aria-hidden /> Reminder calls
            </Link>
            {role !== 'doctor' && role !== 'admin' && (
              <Link
                to={role === 'caregiver' ? '/caregiver/doctor' : '/asha/doctor'}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-navy-800 px-4 font-bold text-navy-800 hover:bg-navy-50"
              >
                <Video aria-hidden /> Doctor video call
              </Link>
            )}
            {(role === 'doctor' || role === 'asha' || role === 'admin') && (
              <Link to={`/doctor/reports?patient=${p.id}`} className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-navy-800 px-4 font-bold text-navy-800 hover:bg-navy-50">
                <FileText aria-hidden /> Follow-up report
              </Link>
            )}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Today's medication timeline">
            <div className="space-y-3">
              {!data.today.length && <p className="text-slate-500">No doses scheduled today.</p>}
              {data.today.map((d) => (
                <DoseCard key={d.id} dose={d} busy={busyId === d.id} onConfirm={canConfirm ? (s) => confirm(d, s, role === 'asha' ? 'asha' : 'caregiver') : undefined} />
              ))}
            </div>
          </Card>
          <Card
            title={
              <span className="flex items-center gap-2">
                <HeartPulse className="h-5 w-5 text-bad-600" aria-hidden /> Health readings (BP, sugar…)
              </span>
            }
          >
            <VitalsPanel patientId={p.id} />
          </Card>
          <Card title="Prescription conflicts">
            <ConflictList conflicts={data.conflicts} />
          </Card>
          <Card title="Adherence (last 14 days)">
            <div className="mb-2 flex gap-4">
              <Badge tone="navy">7 days: {pctText(data.adherence7d.pct)}</Badge>
              <Badge tone="navy">30 days: {pctText(data.adherence30d.pct)}</Badge>
              <Badge tone={data.adherence7d.missed >= 3 ? 'red' : 'slate'}>Missed (7d): {data.adherence7d.missed}</Badge>
            </div>
            <AdherenceChart series={data.series} height={200} />
            <DoseBars series={data.series} height={200} />
          </Card>
          <Card
            title="Prescriptions"
            action={
              canPrescribe && (
                <Button variant={showForm ? 'secondary' : 'primary'} onClick={() => setShowForm((s) => !s)}>
                  {showForm ? 'Close' : 'Add prescription'}
                </Button>
              )
            }
          >
            {showForm && (
              <div className="mb-5 rounded-xl border border-slate-200 p-4">
                <PrescriptionForm
                  patientId={p.id}
                  defaultPrescriber={role === 'doctor' ? user.name : ''}
                  onSaved={() => {
                    setShowForm(false);
                    void reload();
                  }}
                />
              </div>
            )}
            <ul className="divide-y">
              {data.prescriptions.map((rx) => (
                <li key={rx.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-bold">
                      {rx.medication_name} {rx.dosage ?? <Badge tone="amber">dosage missing</Badge>}
                    </p>
                    <p className="text-sm text-slate-600">
                      {rx.times.length ? rx.times.join(', ') : FREQ_LABEL[rx.frequency ?? ''] ?? 'No schedule'} · {rx.food_rule} food · {rx.units_per_dose} tab/dose ·{' '}
                      {rx.current_quantity} left
                    </p>
                    <p className="text-sm text-slate-500">
                      {rx.prescriber_name} ({rx.source}) · from {rx.start_date}
                      {rx.end_date ? ` to ${rx.end_date}` : ''}
                    </p>
                  </div>
                  {canPrescribe && (
                    <Button variant="ghost" onClick={() => stop(rx.id)}>
                      Stop
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-5">
          <SafetyScoreCard risk={data.risk} />
          <Card title="Medicine stock">
            <StockList refills={data.refills} />
            {role !== 'patient' && (
              <div className="mt-4 border-t pt-4">
                <RefillForm refills={data.refills} onSaved={() => void reload()} />
              </div>
            )}
          </Card>
          <Card title="Care team">
            <ul className="space-y-2">
              <li>
                <strong>Caregiver:</strong> {p.caregiver_name ?? '—'} {p.caregiver_relation ? `(${p.caregiver_relation})` : ''}
                {p.caregiver_phone && (
                  <a href={`tel:${p.caregiver_phone}`} className="ml-2 inline-flex items-center gap-1 text-navy-600 underline">
                    <Phone className="h-4 w-4" aria-hidden /> Call
                  </a>
                )}
              </li>
              <li>
                <strong>ASHA:</strong> {p.asha_name ?? '—'}
              </li>
              <li>
                <strong>Doctor:</strong> {p.doctor_name ?? '—'} {p.doctor_facility ? `· ${p.doctor_facility}` : ''}
              </li>
              {p.phone && (
                <li>
                  <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 font-semibold text-navy-600 underline">
                    <Phone className="h-4 w-4" aria-hidden /> Call patient
                  </a>
                </li>
              )}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
