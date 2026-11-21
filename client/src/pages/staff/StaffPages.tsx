/** ASHA and doctor screens. */
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, CalendarClock, Package, Printer, ShieldAlert, Users, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { api, errorText } from '../../api/client';
import AlertList from '../../components/AlertList';
import { AdherenceChart, ConflictList, SafetyScoreCard } from '../../components/Insights';
import PatientTable from '../../components/PatientTable';
import PrescriptionForm from '../../components/PrescriptionForm';
import { Badge, Button, Card, EmptyState, ErrorState, Field, PageHeader, Spinner, StatCard } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { dateOf, dateTimeOf, FREQ_LABEL, pctText, timeOf } from '../../lib/format';
import { useAuth } from '../../store/auth';
import { toast } from '../../store/toast';
import type { Alert, Conflict, Dose, PatientInfo, PatientSummary, Prescription, RefillPrediction, Risk, SeriesPoint, Adherence } from '../../types';

interface StaffDash {
  cards: { totalPatients: number; atRisk: number; highRisk: number; missedToday: number; refillWarnings: number; needFollowUp: number };
  patients: PatientSummary[];
}

function Cards({ c }: { c: StaffDash['cards'] }) {
  return (
    <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard label="Total patients" value={c.totalPatients} icon={<Users aria-hidden />} />
      <StatCard label="Patients at risk" value={c.atRisk} tone="amber" icon={<ShieldAlert aria-hidden />} />
      <StatCard label="Missed doses today" value={c.missedToday} tone="red" icon={<XCircle aria-hidden />} />
      <StatCard label="Refill warnings" value={c.refillWarnings} tone="amber" icon={<Package aria-hidden />} />
      <StatCard label="Need follow-up" value={c.needFollowUp} tone="red" icon={<CalendarClock aria-hidden />} />
    </div>
  );
}

export function AshaDashboard() {
  const { data, loading, error, reload } = useApi<StaffDash>('/dashboard/asha', { poll: 60_000, cacheKey: 'asha-dashboard' });
  const alerts = useApi<{ alerts: Alert[] }>('/alerts?status=open&mine=true', { poll: 60_000 });
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  return (
    <div className="space-y-6">
      <PageHeader title="ASHA dashboard" subtitle="Patients sorted by Medication Safety Score (riskiest first)" />
      <Cards c={data.cards} />
      <PatientTable patients={data.patients} />
      <Card title="Open alerts for you" action={<Link to="/asha/alerts" className="font-semibold text-navy-600 hover:underline">All alerts</Link>}>
        <AlertList alerts={(alerts.data?.alerts ?? []).slice(0, 5)} onChanged={() => void alerts.reload()} />
      </Card>
    </div>
  );
}

const patientFormSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  age: z.coerce.number().int().min(0).max(120),
  gender: z.enum(['F', 'M', 'O']),
  village: z.string().trim().min(2, 'Enter village').max(80),
  phone: z.string().trim().regex(/^$|^[6-9]\d{9}$/, '10-digit mobile number'),
  bp: z.boolean(),
  diabetes: z.boolean(),
  caregiverId: z.string(),
});
type PatientForm = z.infer<typeof patientFormSchema>;

function AddPatientForm({ onSaved }: { onSaved: () => void }) {
  const staff = useApi<{ caregivers: { id: number; name: string; relation: string | null }[] }>('/staff');
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PatientForm>({ resolver: zodResolver(patientFormSchema), defaultValues: { gender: 'F', bp: false, diabetes: false, phone: '', caregiverId: '' } });
  const submit = async (v: PatientForm) => {
    try {
      await api('/patients', {
        method: 'POST',
        body: {
          name: v.name,
          age: v.age,
          gender: v.gender,
          village: v.village,
          phone: v.phone,
          conditions: [...(v.bp ? ['BP'] : []), ...(v.diabetes ? ['Diabetes'] : [])],
          caregiverId: v.caregiverId ? Number(v.caregiverId) : null,
        },
      });
      toast.success('Patient added');
      reset();
      onSaved();
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="grid gap-4 md:grid-cols-3">
      <Field label="Name" htmlFor="np-name" error={errors.name?.message}>
        <input id="np-name" className="input" {...register('name')} />
      </Field>
      <Field label="Age" htmlFor="np-age" error={errors.age?.message}>
        <input id="np-age" type="number" className="input" {...register('age')} />
      </Field>
      <Field label="Gender" htmlFor="np-gender" error={errors.gender?.message}>
        <select id="np-gender" className="input" {...register('gender')}>
          <option value="F">Female</option>
          <option value="M">Male</option>
          <option value="O">Other</option>
        </select>
      </Field>
      <Field label="Village" htmlFor="np-village" error={errors.village?.message}>
        <input id="np-village" className="input" {...register('village')} />
      </Field>
      <Field label="Mobile (optional)" htmlFor="np-phone" error={errors.phone?.message}>
        <input id="np-phone" className="input" inputMode="numeric" maxLength={10} {...register('phone')} />
      </Field>
      <Field label="Caregiver (optional)" htmlFor="np-cg">
        <select id="np-cg" className="input" {...register('caregiverId')}>
          <option value="">None</option>
          {staff.data?.caregivers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.relation ? `(${c.relation})` : ''}
            </option>
          ))}
        </select>
      </Field>
      <fieldset className="flex items-center gap-4 md:col-span-2">
        <legend className="label">Conditions</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-5 w-5" {...register('bp')} /> BP
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-5 w-5" {...register('diabetes')} /> Diabetes
        </label>
      </fieldset>
      <div className="md:col-span-3">
        <Button type="submit" loading={isSubmitting}>
          Add patient
        </Button>
      </div>
    </form>
  );
}

export function StaffPatients({ title = 'Patients' }: { title?: string }) {
  const role = useAuth((s) => s.user!.role);
  const { data, loading, error, reload } = useApi<{ patients: PatientSummary[] }>('/patients', { cacheKey: 'staff-patients' });
  const [adding, setAdding] = useState(false);
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState message={error.message} onRetry={reload} />;
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle="Filter by risk, missed doses, refills or condition. Click a name for full details."
        action={
          role !== 'caregiver' && (
            <Button variant={adding ? 'secondary' : 'primary'} onClick={() => setAdding((a) => !a)}>
              {adding ? 'Close' : 'Add patient'}
            </Button>
          )
        }
      />
      {adding && (
        <Card title="New patient">
          <AddPatientForm
            onSaved={() => {
              setAdding(false);
              void reload();
            }}
          />
        </Card>
      )}
      <PatientTable patients={data?.patients ?? []} />
    </div>
  );
}

export function StaffAlerts() {
  const [status, setStatus] = useState('open');
  const [type, setType] = useState('');
  const { data, loading, error, reload } = useApi<{ alerts: Alert[] }>(`/alerts?status=${status}${type ? `&type=${type}` : ''}`, { poll: 60_000 });
  return (
    <div className="space-y-6">
      <PageHeader title="Alerts" subtitle="Missed doses, repeated misses, refills, prescription warnings and help requests" />
      <div className="flex flex-wrap gap-3">
        <select className="input max-w-[200px]" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
        </select>
        <select className="input max-w-[240px]" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="">All types</option>
          <option value="missed_dose">Missed dose</option>
          <option value="repeated_miss">Repeated misses</option>
          <option value="refill">Refill</option>
          <option value="conflict">Prescription warning</option>
          <option value="help">Help requests</option>
        </select>
      </div>
      {loading && !data ? <Spinner /> : error ? <ErrorState message={error.message} onRetry={reload} /> : <AlertList alerts={data?.alerts ?? []} onChanged={() => void reload()} />}
    </div>
  );
}

export function DoctorDashboard() {
  const { data, loading, error, reload } = useApi<StaffDash & { conflicts: Alert[]; safetyAlerts: Alert[] }>('/dashboard/doctor', { poll: 60_000, cacheKey: 'doctor-dashboard' });
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  return (
    <div className="space-y-6">
      <PageHeader title="Doctor dashboard" subtitle="Review adherence and warnings before making clinical decisions" />
      <Cards c={data.cards} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><AlertTriangle className="text-warn-600" aria-hidden /> Prescription conflicts</span>}>
          <AlertList alerts={data.conflicts} onChanged={() => void reload()} />
        </Card>
        <Card title={<span className="flex items-center gap-2"><ShieldAlert className="text-bad-600" aria-hidden /> Safety alerts</span>}>
          <AlertList alerts={data.safetyAlerts} onChanged={() => void reload()} />
        </Card>
      </div>
      <PatientTable patients={data.patients} />
    </div>
  );
}

function PatientPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useApi<{ patients: PatientSummary[] }>('/patients', { cacheKey: 'staff-patients' });
  return (
    <select className="input max-w-sm" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Choose patient">
      <option value="">Choose a patient…</option>
      {data?.patients.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} — {p.village}
        </option>
      ))}
    </select>
  );
}

export function DoctorPrescriptions() {
  const user = useAuth((s) => s.user!);
  const [params, setParams] = useSearchParams();
  const pid = params.get('patient') ?? '';
  const { data, loading, error, reload } = useApi<{ prescriptions: Prescription[]; conflicts: Conflict[] }>(pid ? `/patients/${pid}/prescriptions?all=true` : null);

  const stop = async (id: number) => {
    if (!window.confirm('Stop this prescription?')) return;
    try {
      await api(`/prescriptions/${id}/stop`, { method: 'POST' });
      toast.success('Prescription stopped');
      void reload();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Prescription management" subtitle="New prescriptions are checked for duplicates, shared ingredients and timing conflicts before saving." />
      <PatientPicker value={pid} onChange={(v) => setParams(v ? { patient: v } : {})} />
      {!pid ? (
        <EmptyState title="Choose a patient to manage prescriptions" />
      ) : loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : (
        data && (
          <>
            <Card title="Warnings to verify">
              <ConflictList conflicts={data.conflicts} />
            </Card>
            <Card title="Prescriptions">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="table-th">Medicine</th>
                      <th className="table-th">Dosage</th>
                      <th className="table-th">Schedule</th>
                      <th className="table-th">Prescriber</th>
                      <th className="table-th">Stock</th>
                      <th className="table-th">Status</th>
                      <th className="table-th" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.prescriptions.map((rx) => (
                      <tr key={rx.id}>
                        <td className="table-td font-semibold">{rx.medication_name}</td>
                        <td className="table-td">{rx.dosage ?? <Badge tone="amber">missing</Badge>}</td>
                        <td className="table-td">
                          {rx.times.length ? rx.times.join(', ') : FREQ_LABEL[rx.frequency ?? ''] ?? '—'} · {rx.food_rule}
                        </td>
                        <td className="table-td">
                          {rx.prescriber_name}
                          <p className="text-sm text-slate-500">{rx.source}</p>
                        </td>
                        <td className="table-td">{rx.current_quantity}</td>
                        <td className="table-td">
                          <Badge tone={rx.status === 'active' ? 'green' : 'slate'}>{rx.status}</Badge>
                        </td>
                        <td className="table-td">
                          {rx.status === 'active' && (
                            <Button variant="ghost" onClick={() => stop(rx.id)}>
                              Stop
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="Add prescription">
              <PrescriptionForm patientId={Number(pid)} defaultPrescriber={user.role === 'doctor' ? user.name : ''} onSaved={() => void reload()} />
            </Card>
          </>
        )
      )}
    </div>
  );
}

interface Report {
  generatedAt: string;
  patient: PatientInfo;
  adherence30d: Adherence;
  adherence7d: Adherence;
  series: SeriesPoint[];
  missedHistory: Dose[];
  refillGaps: RefillPrediction[];
  refillHistory: { quantity_added: number; refilled_at: string; medication_name: string }[];
  conflicts: Conflict[];
  risk: Risk;
  recentAlerts: Alert[];
  note: string;
}

export function DoctorReports() {
  const [params, setParams] = useSearchParams();
  const pid = params.get('patient') ?? '';
  const { data, loading, error, reload } = useApi<Report>(pid ? `/patients/${pid}/report` : null);
  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader
          title="Follow-up report"
          subtitle="A summary to review before the next consultation"
          action={
            data && (
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer aria-hidden /> Print / save PDF
              </Button>
            )
          }
        />
        <PatientPicker value={pid} onChange={(v) => setParams(v ? { patient: v } : {})} />
      </div>
      {!pid ? (
        <EmptyState title="Choose a patient to generate the report" />
      ) : loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : (
        data && (
          <article className="card space-y-5">
            <header className="border-b pb-3">
              <h2 className="text-2xl font-bold">Medication follow-up report</h2>
              <p className="text-sm text-slate-500">Generated {dateTimeOf(data.generatedAt)} · {data.note}</p>
            </header>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-slate-500">Patient</dt>
                <dd className="text-lg font-bold">
                  {data.patient.name}, {data.patient.age ?? '—'} y · {data.patient.village}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Condition</dt>
                <dd className="text-lg">{data.patient.conditions.join(' + ') || '—'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Adherence</dt>
                <dd className="text-lg">
                  30 days: <strong>{pctText(data.adherence30d.pct)}</strong> · 7 days: <strong>{pctText(data.adherence7d.pct)}</strong>
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Missed doses (30 days)</dt>
                <dd className="text-lg font-bold">{data.adherence30d.missed}</dd>
              </div>
            </dl>
            <AdherenceChart series={data.series} height={200} />
            <section>
              <h3 className="mb-2 text-lg font-bold">Refill gaps</h3>
              {data.refillGaps.length ? (
                <ul className="list-disc pl-6">
                  {data.refillGaps.map((r) => (
                    <li key={r.prescriptionId}>
                      {r.medicationName}: about {r.daysLeft} days left{r.refillBy ? `, refill before ${dateOf(r.refillBy)}` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>None</p>
              )}
              {data.refillHistory.length > 0 && (
                <p className="mt-2 text-sm text-slate-600">
                  Refill history: {data.refillHistory.map((r) => `${r.medication_name} +${r.quantity_added} (${dateOf(r.refilled_at)})`).join('; ')}
                </p>
              )}
            </section>
            <section>
              <h3 className="mb-2 text-lg font-bold">Prescription warnings</h3>
              <ConflictList conflicts={data.conflicts} />
            </section>
            <section>
              <h3 className="mb-2 text-lg font-bold">Missed-dose history (latest)</h3>
              {data.missedHistory.length ? (
                <ul className="grid gap-1 sm:grid-cols-2">
                  {data.missedHistory.slice(0, 20).map((d) => (
                    <li key={d.id}>
                      {dateOf(d.scheduled_at)} {timeOf(d.scheduled_at)} — {d.medication_name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>None</p>
              )}
            </section>
            <section>
              <h3 className="mb-2 text-lg font-bold">Recent alerts</h3>
              <ul className="space-y-1">
                {data.recentAlerts.map((a, i) => (
                  <li key={i}>
                    <Badge tone={a.severity === 'high' ? 'red' : a.severity === 'medium' ? 'amber' : 'navy'}>{a.type}</Badge> {a.message}{' '}
                    <span className="text-sm text-slate-500">({dateTimeOf(a.created_at)}, {a.status})</span>
                  </li>
                ))}
              </ul>
            </section>
            <SafetyScoreCard risk={data.risk} />
          </article>
        )
      )}
    </div>
  );
}
