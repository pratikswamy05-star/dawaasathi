import { Activity, HeartPulse, Volume2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, ApiError, errorText } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useT, type TKey } from '../i18n';
import { dateOf, dateTimeOf } from '../lib/format';
import { speak } from '../lib/speech';
import { toast } from '../store/toast';
import type { Vital, VitalKind, VitalKindInfo, VitalLevel } from '../types';
import { Badge, Button, Card, EmptyState, ErrorState, Spinner } from './ui';

const KINDS: VitalKind[] = ['bp', 'sugar_fasting', 'sugar_random', 'pulse', 'temperature', 'weight'];

const LEVEL_TONE: Record<VitalLevel, 'green' | 'amber' | 'red'> = { normal: 'green', watch: 'amber', high: 'red', urgent: 'red' };
const LEVEL_KEY: Record<VitalLevel, TKey> = { normal: 'levelNormal', watch: 'levelWatch', high: 'levelHigh', urgent: 'levelUrgent' };
const LEVEL_DOT: Record<VitalLevel, string> = { normal: '🟢', watch: '🟡', high: '🔴', urgent: '🚨' };

// Reference lines on the chart (upper "usual" limit) — the same bands the server uses.
const REF: Partial<Record<VitalKind, { y: number; label: string }[]>> = {
  bp: [
    { y: 140, label: '140' },
    { y: 90, label: '90' },
  ],
  sugar_fasting: [{ y: 126, label: '126' }],
  sugar_random: [{ y: 200, label: '200' }],
  temperature: [{ y: 100.4, label: '100.4' }],
};

export function LevelBadge({ level }: { level: VitalLevel }) {
  const { t } = useT();
  return (
    <Badge tone={LEVEL_TONE[level]} className={level === 'urgent' ? 'animate-pulse' : ''}>
      {LEVEL_DOT[level]} {t(LEVEL_KEY[level])}
    </Badge>
  );
}

/** Log + chart of BP / sugar / pulse / temperature / weight for one patient. Used by patient, caregiver, ASHA and doctor. */
export default function VitalsPanel({ patientId, big = false }: { patientId: number; big?: boolean }) {
  const { t, lang } = useT();
  const { data, loading, error, reload } = useApi<{ vitals: Vital[]; latest: Partial<Record<VitalKind, Vital>>; kinds: Record<VitalKind, VitalKindInfo> }>(
    `/patients/${patientId}/vitals?days=60`,
    { cacheKey: `vitals-${patientId}` },
  );
  const [kind, setKind] = useState<VitalKind>('bp');
  const [v1, setV1] = useState('');
  const [v2, setV2] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<{ level: VitalLevel; advice: string; alerted: string[] } | null>(null);
  const [chartKind, setChartKind] = useState<VitalKind>('bp');

  const chartData = useMemo(
    () =>
      (data?.vitals ?? [])
        .filter((v) => v.kind === chartKind)
        .slice()
        .reverse()
        .map((v) => ({ label: dateOf(v.measured_at), a: v.value1, b: v.value2, level: v.level })),
    [data, chartKind],
  );

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  const info = data.kinds[kind];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!v1 || (kind === 'bp' && !v2)) return setErr(kind === 'bp' ? 'Enter both numbers, e.g. 130 and 85' : 'Enter the reading');
    setSaving(true);
    try {
      const r = await api<{ level: VitalLevel; advice: string; alerted: string[] }>(`/patients/${patientId}/vitals`, {
        method: 'POST',
        body: { kind, value1: Number(v1), value2: kind === 'bp' ? Number(v2) : undefined, note: note || undefined },
      });
      setLast(r);
      setV1('');
      setV2('');
      setNote('');
      setChartKind(kind);
      toast.success(r.alerted.length ? `Saved. ${r.alerted.join(', ')} informed.` : 'Reading saved');
      if (big) speak(r.advice, lang);
      void reload();
    } catch (e2) {
      setErr(e2 instanceof ApiError && e2.details ? Object.values(e2.details).flat().join(' ') || e2.message : errorText(e2));
    } finally {
      setSaving(false);
    }
  };

  const txt = big ? 'text-xl' : '';

  return (
    <div className="space-y-5">
      {/* Latest readings */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {KINDS.filter((k) => data.latest[k]).map((k) => {
          const v = data.latest[k]!;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setChartKind(k)}
              className={`card text-left transition hover:ring-2 hover:ring-navy-100 ${chartKind === k ? 'ring-2 ring-navy-600' : ''}`}
            >
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{data.kinds[k].label}</p>
              <p className={`${big ? 'text-3xl' : 'text-2xl'} font-extrabold`}>{v.display}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <LevelBadge level={v.level} />
                <span className="text-sm text-slate-500">{dateTimeOf(v.measured_at)}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Add a reading */}
      <Card title={<span className={big ? 'text-2xl' : ''}>➕ {t('addReading')}</span>}>
        <p className={`mb-3 text-slate-600 ${txt}`}>{t('vitalsHelp')}</p>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Type of reading">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => {
                  setKind(k);
                  setErr(null);
                }}
                className={`min-h-[48px] rounded-xl border-2 px-4 font-semibold ${kind === k ? 'border-navy-800 bg-navy-800 text-white' : 'border-slate-300 bg-white text-navy-800'}`}
              >
                {data.kinds[k].label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[140px]">
              <span className="label">{kind === 'bp' ? 'Upper (systolic)' : info.label}</span>
              <input className={`input ${big ? 'text-2xl' : ''}`} inputMode="decimal" value={v1} onChange={(e) => setV1(e.target.value.replace(/[^\d.]/g, ''))} placeholder={kind === 'bp' ? '130' : ''} />
            </label>
            {kind === 'bp' && (
              <>
                <span className="pb-3 text-2xl font-bold">/</span>
                <label className="flex-1 min-w-[140px]">
                  <span className="label">Lower (diastolic)</span>
                  <input className={`input ${big ? 'text-2xl' : ''}`} inputMode="decimal" value={v2} onChange={(e) => setV2(e.target.value.replace(/[^\d.]/g, ''))} placeholder="85" />
                </label>
              </>
            )}
            <span className="pb-3 font-semibold text-slate-500">{info.unit}</span>
          </div>
          <label className="block">
            <span className="label">Note (optional)</span>
            <input className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. felt dizzy, after lunch" />
          </label>
          {err && (
            <p className="field-error text-base" role="alert">
              {err}
            </p>
          )}
          <Button type="submit" size={big ? 'lg' : 'md'} loading={saving} className="w-full sm:w-auto">
            <Activity aria-hidden /> {t('addReading')}
          </Button>
        </form>
        {last && (
          <div
            className={`mt-4 rounded-xl border-l-8 p-4 ${last.level === 'normal' ? 'border-l-ok-600 bg-ok-50' : last.level === 'watch' ? 'border-l-warn-600 bg-warn-50' : 'border-l-bad-600 bg-bad-50'}`}
            role="status"
          >
            <div className="flex flex-wrap items-center gap-2">
              <LevelBadge level={last.level} />
              <button type="button" className="ml-auto flex items-center gap-1 font-semibold text-navy-600" onClick={() => speak(last.advice, lang)}>
                <Volume2 className="h-5 w-5" aria-hidden /> {t('hearReminder')}
              </button>
            </div>
            <p className={`mt-2 font-semibold ${txt}`}>{last.advice}</p>
            {last.alerted.length > 0 && <p className="mt-1 text-slate-700">Informed: {last.alerted.join(', ')}</p>}
          </div>
        )}
      </Card>

      {/* Trend chart */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-bad-600" aria-hidden /> Trend · {data.kinds[chartKind].label}
          </span>
        }
        action={
          <select className="input min-h-[44px] w-auto" value={chartKind} onChange={(e) => setChartKind(e.target.value as VitalKind)} aria-label="Chart">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {data.kinds[k].label}
              </option>
            ))}
          </select>
        }
      >
        {chartData.length < 2 ? (
          <EmptyState title="Add at least 2 readings to see a trend" />
        ) : (
          <div style={{ height: 260 }} role="img" aria-label={`${data.kinds[chartKind].label} trend`}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 13 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 13 }} domain={['auto', 'auto']} />
                <Tooltip />
                {(REF[chartKind] ?? []).map((r) => (
                  <ReferenceLine key={r.y} y={r.y} stroke="#b91c1c" strokeDasharray="6 4" label={{ value: r.label, position: 'right', fontSize: 12, fill: '#b91c1c' }} />
                ))}
                {chartKind === 'bp' && <Legend />}
                <Line type="monotone" dataKey="a" name={chartKind === 'bp' ? 'Upper' : data.kinds[chartKind].unit} stroke="#1e3a6e" strokeWidth={3} dot={{ r: 4 }} />
                {chartKind === 'bp' && <Line type="monotone" dataKey="b" name="Lower" stroke="#d97706" strokeWidth={3} dot={{ r: 4 }} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-2 text-sm text-slate-500">Dashed red line = upper end of the usual range. Colours are a guide only — the doctor decides.</p>
      </Card>

      {/* History */}
      <Card title="All readings (last 60 days)">
        {!data.vitals.length ? (
          <EmptyState title="No readings yet" />
        ) : (
          <ul className="divide-y">
            {data.vitals.slice(0, 40).map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="w-32 text-sm text-slate-500">{dateTimeOf(v.measured_at)}</span>
                <span className="font-semibold">{data.kinds[v.kind].label}</span>
                <span className="font-bold">{v.display}</span>
                <LevelBadge level={v.level} />
                {v.recorded_by_name && <span className="text-sm text-slate-500">by {v.recorded_by_name}</span>}
                {v.note && <span className="w-full text-sm text-slate-600">“{v.note}”</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
