import StreakCard from '../../components/StreakCard';
import { LifeBuoy, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../../api/client';
import AlertList from '../../components/AlertList';
import DoseCard from '../../components/DoseCard';
import { StockList } from '../../components/Insights';
import { Button, Card, EmptyState, ErrorState, PageHeader, ProgressRing, riskLabel, Spinner } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { useConfirmDose } from '../../hooks/useConfirmDose';
import { useT } from '../../i18n';
import { pctText } from '../../lib/format';
import { toast } from '../../store/toast';
import type { Alert, Dose, PatientSummary, RefillPrediction, Streak } from '../../types';

interface Linked {
  summary: PatientSummary;
  streak?: Streak;
  today: Dose[];
  refills: RefillPrediction[];
  alerts: Alert[];
}

/** Caregiver: monitor linked patients, see misses, receive alerts, help confirm doses, check stock. */
export default function CaregiverDashboard() {
  const { t } = useT();
  const { data, loading, error, reload } = useApi<{ patients: Linked[] }>('/dashboard/caregiver', { poll: 30_000, cacheKey: 'caregiver-dashboard' });
  const { confirm, busyId } = useConfirmDose(() => void reload());

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data?.patients.length)
    return (
      <EmptyState title="No patient is linked to your account yet">
        <p>Ask the ASHA worker or doctor to link you to your family member.</p>
      </EmptyState>
    );

  const help = async (pid: number) => {
    try {
      await api(`/patients/${pid}/help`, { method: 'POST' });
      toast.success(t('helpSent'));
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Caregiver dashboard" subtitle="You will be alerted if a dose is missed. Never give an extra dose — ask the doctor if unsure." />
      {data.patients.map(({ summary: s, streak, today, refills, alerts }) => {
        const missed = today.filter((d) => d.status === 'missed');
        const due = today.filter((d) => d.status === 'pending' && new Date(d.scheduled_at).getTime() <= Date.now());
        return (
          <section key={s.id} className="animate-fade-in-up space-y-4" aria-labelledby={`p-${s.id}`}>
            <div className="hero">
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-3xl font-black" aria-hidden>
                      {s.name.charAt(0)}
                    </span>
                    <div>
                      <h2 id={`p-${s.id}`} className="text-3xl font-black">
                        {s.name}
                      </h2>
                      <span className="rounded-full bg-white/15 px-3 py-0.5 text-sm font-semibold">Risk {riskLabel(s.risk.level)}</span>{' '}
                      {streak && <StreakCard streak={streak} compact />}
                    </div>
                  </div>
                  <p className={`mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-1 text-xl font-bold ${missed.length ? 'bg-bad-600' : 'bg-ok-600/80'}`}>
                    {missed.length ? `🔴 ${missed.length} missed today` : `🟢 No missed doses today`}
                  </p>
                  <p className="mt-2 text-white/90">
                    Today: {s.takenToday} / {s.totalToday} taken · Adherence (7 days): <strong>{pctText(s.adherence7d)}</strong>
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link to={`/patients/${s.id}`} className="inline-flex min-h-[48px] items-center rounded-xl bg-white px-4 font-bold text-navy-800 shadow transition hover:-translate-y-0.5">
                      Full details
                    </Link>
                    <Link to={`/patients/${s.id}/card`} className="glass inline-flex min-h-[48px] items-center gap-1 rounded-xl px-4 font-bold text-white transition hover:-translate-y-0.5">
                      🆘 Emergency card
                    </Link>
                    <Link
                      to={`/caregiver/reminders?patient=${s.id}`}
                      className="glass inline-flex min-h-[48px] items-center gap-1 rounded-xl px-4 font-bold text-white transition hover:-translate-y-0.5"
                    >
                      📞 Reminder calls
                    </Link>
                    <Button variant="danger" onClick={() => help(s.id)}>
                      <LifeBuoy className="h-5 w-5" aria-hidden /> Request help
                    </Button>
                    <a href="tel:108" className="glass inline-flex min-h-[48px] items-center gap-1 rounded-xl px-4 font-bold text-white">
                      <Phone className="h-5 w-5" aria-hidden /> 108
                    </a>
                  </div>
                </div>
                <ProgressRing pct={s.totalToday ? Math.round((s.takenToday / s.totalToday) * 100) : 0} size={120}>
                  <span className="text-3xl font-black">{s.takenToday}/{s.totalToday}</span>
                  <span className="text-xs font-semibold text-teal-100">taken today</span>
                </ProgressRing>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Alerts">
                <AlertList alerts={alerts} onChanged={() => void reload()} showPatient={false} />
              </Card>
              <div className="space-y-5">
                {[...missed, ...due].length > 0 && (
                  <Card title="Help with these doses">
                    <p className="mb-3 text-sm text-slate-600">Mark TAKEN only if you saw the dose taken. Do not give an extra dose for a missed one.</p>
                    <div className="space-y-3">
                      {[...due, ...missed].map((d) => (
                        <DoseCard key={d.id} dose={d} busy={busyId === d.id} onConfirm={(st) => confirm(d, st, 'caregiver')} />
                      ))}
                    </div>
                  </Card>
                )}
                <Card title="Medicine stock">
                  <StockList refills={refills} />
                </Card>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
