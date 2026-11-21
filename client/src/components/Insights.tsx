/** Shared read-only widgets: safety score, conflicts, stock, adherence chart, timeline. */
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useT } from '../i18n';
import { dateOf, timeOf } from '../lib/format';
import type { Conflict, Dose, RefillPrediction, Risk, SeriesPoint } from '../types';
import { DoseStatusBadge } from './DoseCard';
import { Badge, EmptyState, riskLabel, riskTone, stockDot, stockTone } from './ui';

export function SafetyScoreCard({ risk }: { risk: Risk }) {
  return (
    <section className="card" aria-labelledby="score-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="score-title" className="text-lg font-bold">
          Medication Safety Score
        </h2>
        <Badge tone={riskTone(risk.level)}>Risk: {riskLabel(risk.level)}</Badge>
      </div>
      <p className="mt-2 text-4xl font-extrabold text-navy-900">
        {risk.score}
        <span className="text-xl font-semibold text-slate-500">/100</span>
      </p>
      <p className="mt-1 text-sm text-slate-500">Starts at 100. Each factor below shows exactly how many points it removed.</p>
      <ul className="mt-3 divide-y divide-slate-100">
        {risk.factors.map((f) => (
          <li key={f.key} className="flex items-start justify-between gap-3 py-2">
            <div>
              <p className="font-semibold">{f.label}</p>
              <p className="text-sm text-slate-500">{f.detail}</p>
            </div>
            <span className={`whitespace-nowrap font-bold ${f.points < 0 ? 'text-bad-700' : 'text-ok-700'}`}>
              {f.points < 0 ? f.points : '0'} <span className="text-xs font-medium text-slate-400">/ max {f.max}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ConflictList({ conflicts }: { conflicts: Conflict[] }) {
  if (!conflicts.length)
    return (
      <p className="flex items-center gap-2 font-semibold text-ok-700">
        <ShieldCheck aria-hidden /> No prescription warnings
      </p>
    );
  return (
    <ul className="space-y-2">
      {conflicts.map((c, i) => (
        <li key={i} className={`flex gap-3 rounded-xl border p-3 ${c.severity === 'warning' ? 'border-warn-600/30 bg-warn-50' : 'border-navy-600/20 bg-navy-50'}`}>
          <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${c.severity === 'warning' ? 'text-warn-600' : 'text-navy-600'}`} aria-hidden />
          <p>{c.message}</p>
        </li>
      ))}
    </ul>
  );
}

export function StockList({ refills, large }: { refills: RefillPrediction[]; large?: boolean }) {
  const { t } = useT();
  if (!refills.length) return <EmptyState title="No active medicines" />;
  const label = (s: string) => (s === 'critical' ? t('stockCritical') : s === 'soon' ? t('stockSoon') : t('stockSafe'));
  return (
    <ul className="space-y-3">
      {refills.map((r) => (
        <li key={r.prescriptionId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
          <div>
            <p className={`${large ? 'text-xl' : ''} font-bold`}>
              {r.medicationName} {r.dosage && <span className="font-medium text-slate-500">{r.dosage}</span>}
            </p>
            <p className={`${large ? 'text-lg' : 'text-sm'} text-slate-600`}>
              {t('tabletsLeft', { n: r.remaining })}
              {r.daysLeft != null && ` · ${t('daysLeft', { n: r.daysLeft })}`}
            </p>
            {r.refillBy && r.status !== 'safe' && <p className={`${large ? 'text-lg' : 'text-sm'} font-semibold text-warn-700`}>{t('refillBy', { date: dateOf(r.refillBy) })}</p>}
          </div>
          <Badge tone={stockTone(r.status)} className={large ? 'text-base' : ''}>
            {stockDot(r.status)} {label(r.status)}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export function AdherenceChart({ series, height = 240 }: { series: SeriesPoint[]; height?: number }) {
  const data = series.map((s) => ({ ...s, label: dateOf(s.date) }));
  return (
    <div style={{ height }} role="img" aria-label={`Adherence over ${series.length} days`}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 13 }} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} tick={{ fontSize: 13 }} unit="%" />
          <Tooltip formatter={(v) => [`${v}%`, 'Taken']} />
          <Line type="monotone" dataKey="pct" stroke="#1e3a6e" strokeWidth={3} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DoseBars({ series, height = 240 }: { series: SeriesPoint[]; height?: number }) {
  const data = series.map((s) => ({ ...s, label: dateOf(s.date) }));
  return (
    <div style={{ height }} role="img" aria-label="Taken and missed doses per day">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 13 }} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 13 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="taken" name="Taken" stackId="a" fill="#15803d" />
          <Bar dataKey="missed" name="Missed" stackId="a" fill="#b91c1c" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Compact daily timeline (staff and caregiver views). */
export function Timeline({ doses }: { doses: Dose[] }) {
  const { t } = useT();
  if (!doses.length) return <EmptyState title="No doses scheduled today" />;
  return (
    <ol className="space-y-2">
      {doses.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
          <div className="flex items-center gap-3">
            <span className="w-20 font-bold">{timeOf(d.scheduled_at)}</span>
            <span>
              💊 <strong>{d.medication_name}</strong> {d.dosage} · <span className="text-slate-500">{t(d.food_rule)}</span>
            </span>
          </div>
          <DoseStatusBadge dose={d} />
        </li>
      ))}
    </ol>
  );
}
