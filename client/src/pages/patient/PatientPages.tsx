/** Patient screens: dashboard, today, medicines, history, refills. Large text, few choices, voice everywhere. */
import { Phone, User as UserIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import DoseCard from '../../components/DoseCard';
import { AdherenceChart, DoseBars, StockList } from '../../components/Insights';
import StreakCard from '../../components/StreakCard';
import { Card, EmptyState, ErrorState, ProgressRing, Spinner } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { useConfirmDose } from '../../hooks/useConfirmDose';
import { useT } from '../../i18n';
import { dateOf, FREQ_LABEL, pctText, timeOf } from '../../lib/format';
import { useAuth } from '../../store/auth';
import type { Adherence, Dose, Overview, Prescription, RefillPrediction, SeriesPoint } from '../../types';

type Dash = Overview & { progress: { done: number; total: number }; next: Dose | null };

function useMyPatientId() {
  return useAuth((s) => s.user?.patientId ?? null);
}

export function PatientDashboard() {
  const { t } = useT();
  const user = useAuth((s) => s.user);
  const { data, setData, loading, error, stale, reload } = useApi<Dash>('/dashboard/patient', { poll: 30_000, cacheKey: 'patient-dashboard' });
  const { confirm, busyId } = useConfirmDose((d) => {
    if (!data) return;
    const today = data.today.map((x) => (x.id === d.id ? d : x));
    setData({ ...data, today, next: today.find((x) => x.status === 'pending') ?? null, progress: { done: today.filter((x) => x.status === 'taken').length, total: today.length } });
    void reload();
  });

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;

  const h = new Date().getHours();
  const greet = h < 12 ? t('goodMorning') : h < 17 ? t('goodAfternoon') : t('goodEvening');
  const warnings = data.refills.filter((r) => r.status !== 'safe');
  const pct = data.progress.total ? Math.round((data.progress.done / data.progress.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className="hero">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-lg font-semibold text-teal-100">
              {h < 12 ? '🌅' : h < 17 ? '☀️' : '🌙'} {new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="mt-1 text-3xl font-black leading-tight sm:text-4xl">
              {greet},<br />
              {user?.name}
            </h1>
            <p className="mt-3 text-xl font-semibold text-white/90">{t('dosesCompleted', data.progress)}</p>
          </div>
          <ProgressRing pct={pct}>
            <span className="text-4xl font-black">{pct}%</span>
            <span className="text-sm font-semibold text-teal-100">{t('todaysProgress')}</span>
          </ProgressRing>
        </div>
      </section>
      {stale && <p className="rounded-xl bg-warn-50 p-3 font-semibold text-warn-700">{t('offline')}</p>}
      {data.streak && <StreakCard streak={data.streak} />}

      <section aria-labelledby="next-title" className="animate-fade-in-up [animation-delay:100ms]">
        <h2 id="next-title" className="mb-2 flex items-center gap-2 text-2xl font-extrabold">
          <span className="relative flex h-3 w-3" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok-500 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-ok-500" />
          </span>
          {t('nextMedicine')}
        </h2>
        {data.next ? (
          <div className="rounded-card shadow-glow">
            <DoseCard big dose={data.next} busy={busyId === data.next.id} onConfirm={(s, m) => confirm(data.next!, s, m)} />
          </div>
        ) : (
          <p className="card text-2xl font-bold text-ok-700">🎉 {t('noMoreToday')}</p>
        )}
        <p className="mt-2 text-lg text-slate-600">{t('noExtraDose')}</p>
      </section>

      <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(
          [
            ['/patient/today', '📋', t('todaysMedicines'), 'from-navy-700 to-navy-500'],
            ['/patient/reminders', '📞', t('voiceReminders'), 'from-ok-600 to-teal-500'],
            ['/patient/vitals', '❤️', t('vitals'), 'from-bad-600 to-[#f472b6]'],
            ['/patient/doctor', '📹', t('doctorCall'), 'from-teal-700 to-teal-400'],
            ['/patient/scan', '📷', t('scanMedicine'), 'from-[#6d28d9] to-[#a78bfa]'],
            ['/patient/pharmacy', '💊', t('pharmacy'), 'from-warn-600 to-warn-500'],
            ['/patient/ask', '💬', t('askTitle'), 'from-navy-600 to-teal-500'],
            ['/patient/report', '📄', t('weeklyReport'), 'from-slate-600 to-slate-400'],
            ['/patient/card', '🆘', t('emergencyCard'), 'from-bad-700 to-bad-500'],
          ] as const
        ).map(([to, icon, label, grad]) => (
          <Link key={to} to={to} className="card group flex min-h-[132px] flex-col items-center justify-center gap-3 p-4 text-center text-lg font-bold leading-tight">
            <span className={`icon-tile h-14 w-14 bg-gradient-to-br text-3xl ${grad}`} aria-hidden>
              {icon}
            </span>
            {label}
          </Link>
        ))}
      </div>

      {warnings.length > 0 && (
        <Card title={<span className="text-2xl">⚠️ {t('refillWarnings')}</span>}>
          <StockList refills={warnings} large />
        </Card>
      )}

      <Card title={<span className="text-2xl">{t('medicineStock')}</span>}>
        <StockList refills={data.refills} large />
      </Card>

      {data.patient.caregiver_name && (
        <Card title={<span className="text-2xl">{t('caregiver')}</span>}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xl font-semibold">
              <UserIcon aria-hidden /> {data.patient.caregiver_name}
              {data.patient.caregiver_relation && <span className="text-slate-500">({data.patient.caregiver_relation})</span>}
            </p>
            {data.patient.caregiver_phone && (
              <a href={`tel:${data.patient.caregiver_phone}`} className="inline-flex min-h-[56px] items-center gap-2 rounded-xl bg-navy-800 px-5 text-xl font-bold text-white">
                <Phone aria-hidden /> {t('callCaregiver')}
              </a>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

export function PatientToday() {
  const { t } = useT();
  const pid = useMyPatientId();
  const { data, setData, loading, error, reload } = useApi<{ doses: Dose[] }>(pid ? `/patients/${pid}/doses` : null, { poll: 30_000, cacheKey: pid ? `doses-${pid}` : undefined });
  const { confirm, busyId } = useConfirmDose((d) => data && setData({ doses: data.doses.map((x) => (x.id === d.id ? d : x)) }));

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState message={error.message} onRetry={reload} />;
  const doses = data?.doses ?? [];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-extrabold">{t('todaysMedicines')}</h1>
      <p className="text-lg text-slate-600">{t('noExtraDose')}</p>
      {!doses.length && <EmptyState title={t('noMoreToday')} />}
      {doses.map((d) => (
        <DoseCard key={d.id} dose={d} busy={busyId === d.id} onConfirm={new Date(d.scheduled_at).getTime() - Date.now() < 2 * 3600_000 ? (s, m) => confirm(d, s, m) : undefined} />
      ))}
    </div>
  );
}

export function PatientMedicines() {
  const { t } = useT();
  const pid = useMyPatientId();
  const { data, loading, error, reload } = useApi<{ prescriptions: Prescription[] }>(pid ? `/patients/${pid}/prescriptions` : null, { cacheKey: pid ? `rx-${pid}` : undefined });
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState message={error.message} onRetry={reload} />;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-extrabold">{t('myMedicines')}</h1>
      {!data?.prescriptions.length && <EmptyState title="No active medicines" />}
      {data?.prescriptions.map((p) => (
        <article key={p.id} className="card space-y-1">
          <p className="text-2xl font-bold">
            💊 {p.medication_name} <span className="font-semibold text-slate-600">{p.dosage ?? ''}</span>
          </p>
          <p className="text-xl">
            {p.times.length ? p.times.join(', ') : FREQ_LABEL[p.frequency ?? ''] ?? ''} · {t(p.food_rule)}
            {p.units_per_dose > 1 && ` · ${p.units_per_dose} tablets each time`}
          </p>
          <p className="text-lg text-slate-600">{t('tabletsLeft', { n: p.current_quantity })}</p>
          {(p.instructions || p.medication_instructions) && (
            <p className="text-lg">
              <strong>{t('instructions')}:</strong> {p.instructions || p.medication_instructions}
            </p>
          )}
          <p className="text-sm text-slate-500">
            {p.prescriber_name} · {p.source}
          </p>
        </article>
      ))}
    </div>
  );
}

export function PatientHistory() {
  const { t } = useT();
  const pid = useMyPatientId();
  const { data, loading, error, reload } = useApi<{ series: SeriesPoint[]; adherence: Adherence; logs: Dose[] }>(pid ? `/patients/${pid}/history?days=14` : null, {
    cacheKey: pid ? `history-${pid}` : undefined,
  });
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-3xl font-extrabold">{t('history')}</h1>
      <Card title="Last 14 days">
        <p className="mb-2 text-2xl font-bold">
          {pctText(data.adherence.pct)} <span className="text-lg font-medium text-slate-600">doses taken</span>
        </p>
        <DoseBars series={data.series} />
      </Card>
      <Card title="Adherence trend">
        <AdherenceChart series={data.series} />
      </Card>
      <Card title="Recent doses">
        <ul className="divide-y">
          {data.logs.slice(0, 40).map((l) => (
            <li key={l.id} className="flex items-center justify-between py-2 text-lg">
              <span>
                {dateOf(l.scheduled_at)} {timeOf(l.scheduled_at)} · <strong>{l.medication_name}</strong>
              </span>
              <span className={l.status === 'taken' ? 'font-bold text-ok-700' : 'font-bold text-bad-700'}>{l.status === 'taken' ? `✓ ${t('statusTaken')}` : `✕ ${t('statusMissed')}`}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function PatientRefills() {
  const { t } = useT();
  const pid = useMyPatientId();
  const { data, loading, error, reload } = useApi<{ predictions: RefillPrediction[] }>(pid ? `/patients/${pid}/refills` : null, { cacheKey: pid ? `refills-${pid}` : undefined });
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState message={error.message} onRetry={reload} />;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-extrabold">{t('refills')}</h1>
      <StockList refills={data?.predictions ?? []} large />
    </div>
  );
}
