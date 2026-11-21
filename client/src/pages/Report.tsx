import { ArrowLeft, Printer } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdherenceChart, DoseBars } from '../components/Insights';
import { Button, ErrorState, Spinner } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { dateOf, dateTimeOf, FREQ_LABEL, pctText } from '../lib/format';
import { useAuth } from '../store/auth';
import type { Conflict, PatientInfo, Prescription, RefillPrediction, Risk, SeriesPoint, VitalLevel } from '../types';

interface ReportData {
  generatedAt: string;
  from: string;
  to: string;
  days: number;
  patient: PatientInfo;
  adherence: { taken: number; missed: number; pct: number | null };
  series: SeriesPoint[];
  prescriptions: Prescription[];
  refills: RefillPrediction[];
  conflicts: Conflict[];
  risk: Risk;
  missedDoses: { scheduled_at: string; medication_name: string; dosage: string | null }[];
  vitals: { kind: string; label: string; display: string; level: VitalLevel; measured_at: string }[];
  teleconsults: { reason: string; status: string; scheduled_at: string | null; doctor_note: string | null; created_at: string }[];
  alerts: { type: string; severity: string; message: string; status: string; created_at: string }[];
}

const LEVEL = { normal: '🟢 Normal', watch: '🟡 Watch', high: '🔴 High', urgent: '🚨 Urgent' };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="print-break mt-6">
      <h2 className="mb-2 border-b-2 border-navy-800 pb-1 text-lg font-bold uppercase tracking-wide text-navy-800">{title}</h2>
      {children}
    </section>
  );
}

/** Printable weekly report — press "Save as PDF" to share with the doctor. */
export default function Report() {
  const { id } = useParams();
  const nav = useNavigate();
  const me = useAuth((s) => s.user!);
  const patientId = id ?? String(me.patientId ?? '');
  const [days, setDays] = useState(7);
  const { data, loading, error, reload } = useApi<ReportData>(patientId ? `/patients/${patientId}/weekly-report?days=${days}` : null);

  if (!patientId) return <ErrorState message="No patient selected" />;
  if (loading && !data) return <Spinner label="Preparing report…" />;
  if (error && !data) return <ErrorState message={error.status === 403 ? 'You do not have access to this patient.' : error.message} onRetry={reload} />;
  if (!data) return null;
  const p = data.patient;

  // Average of each vital over the period (simple, for the doctor's quick look).
  const byKind = new Map<string, { label: string; items: ReportData['vitals'] }>();
  for (const v of data.vitals) {
    const e = byKind.get(v.kind) ?? { label: v.label, items: [] };
    e.items.push(v);
    byKind.set(v.kind, e);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => nav(-1)} className="flex items-center gap-1 font-semibold text-navy-600 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back
        </button>
        <select className="input ml-auto w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Report period">
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
        </select>
        <Button onClick={() => window.print()}>
          <Printer className="h-5 w-5" aria-hidden /> Download PDF / Print
        </Button>
      </div>
      <p className="no-print mb-4 rounded-xl bg-navy-50 p-3 text-navy-800">
        Tip: in the print window choose <strong>“Save as PDF”</strong> as the printer to get a PDF file you can send on WhatsApp.
      </p>

      <article id="print-area" className="card bg-white">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-slate-500">DawaaSathi · Medicine report</p>
            <h1 className="text-3xl font-extrabold text-navy-900">{p.name}</h1>
            <p className="text-slate-700">
              {p.age ? `${p.age} years` : ''} {p.gender ?? ''} · {p.village ?? ''} · {p.conditions.join(', ') || 'No conditions recorded'}
            </p>
          </div>
          <div className="text-right text-sm text-slate-600">
            <p className="font-bold text-navy-900">
              {dateOf(data.from)} – {dateOf(data.to)}
            </p>
            <p>Generated {dateTimeOf(data.generatedAt)}</p>
            <p>Doctor: {p.doctor_name ?? '—'}</p>
            <p>ASHA: {p.asha_name ?? '—'}</p>
            <p>Caregiver: {p.caregiver_name ?? '—'}</p>
          </div>
        </header>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Doses taken', `${data.adherence.taken}`],
            ['Doses missed', `${data.adherence.missed}`],
            ['Adherence', pctText(data.adherence.pct)],
            ['Safety score', `${data.risk.score}/100 (${data.risk.level})`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">{k}</p>
              <p className="text-2xl font-extrabold">{v}</p>
            </div>
          ))}
        </div>

        <Section title="Daily adherence">
          <div className="grid gap-4 sm:grid-cols-2">
            <AdherenceChart series={data.series} height={180} />
            <DoseBars series={data.series} height={180} />
          </div>
        </Section>

        <Section title="Current medicines">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-1">Medicine</th>
                <th>How often</th>
                <th>Food</th>
                <th>Prescribed by</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {data.prescriptions.map((rx) => {
                const st = data.refills.find((r) => r.prescriptionId === rx.id);
                return (
                  <tr key={rx.id} className="border-b border-slate-100">
                    <td className="py-1 font-semibold">
                      {rx.medication_name} {rx.dosage}
                    </td>
                    <td>{rx.frequency ? FREQ_LABEL[rx.frequency] : '—'}</td>
                    <td>{rx.food_rule}</td>
                    <td>{rx.prescriber_name}</td>
                    <td>{st ? `${st.remaining} left${st.daysLeft != null ? ` (~${st.daysLeft} d)` : ''}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        {data.conflicts.length > 0 && (
          <Section title="⚠ Prescription warnings for the doctor">
            <ul className="list-disc space-y-1 pl-5">
              {data.conflicts.map((c, i) => (
                <li key={i}>{c.message}</li>
              ))}
            </ul>
          </Section>
        )}

        <Section title={`Missed doses (${data.missedDoses.length})`}>
          {data.missedDoses.length ? (
            <ul className="grid gap-x-6 text-sm sm:grid-cols-2">
              {data.missedDoses.slice(0, 20).map((d, i) => (
                <li key={i}>
                  {dateTimeOf(d.scheduled_at)} — {d.medication_name} {d.dosage ?? ''}
                </li>
              ))}
            </ul>
          ) : (
            <p>No missed doses in this period. 👏</p>
          )}
        </Section>

        <Section title="Health readings">
          {byKind.size ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[...byKind.entries()].map(([k, e]) => (
                <div key={k} className="rounded-xl border border-slate-200 p-3">
                  <p className="font-bold">
                    {e.label} <span className="font-normal text-slate-500">({e.items.length} readings)</span>
                  </p>
                  <ul className="mt-1 text-sm">
                    {e.items.slice(0, 6).map((v, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span>{dateOf(v.measured_at)}</span>
                        <span className="font-semibold">{v.display}</span>
                        <span>{LEVEL[v.level]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p>No readings recorded in this period.</p>
          )}
        </Section>

        {data.teleconsults.length > 0 && (
          <Section title="Doctor video calls">
            <ul className="space-y-1 text-sm">
              {data.teleconsults.map((t, i) => (
                <li key={i}>
                  <strong>{t.status}</strong> · {t.scheduled_at ? dateTimeOf(t.scheduled_at) : `asked ${dateOf(t.created_at)}`} — {t.reason}
                  {t.doctor_note && <em> · Note: {t.doctor_note}</em>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data.alerts.length > 0 && (
          <Section title={`Alerts in this period (${data.alerts.length})`}>
            <ul className="space-y-1 text-sm">
              {data.alerts.slice(0, 12).map((a, i) => (
                <li key={i}>
                  {dateTimeOf(a.created_at)} · <strong>{a.type.replace('_', ' ')}</strong> ({a.status}) — {a.message}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <footer className="mt-8 border-t pt-3 text-xs text-slate-500">
          This report summarises records entered in DawaaSathi. It is not a diagnosis or prescription. Only a doctor may change medicines or doses.
          Demo prototype with dummy data.
        </footer>
      </article>
    </div>
  );
}
