import { useT } from '../i18n';
import type { Streak } from '../types';

const DOT: Record<string, string> = {
  full: 'bg-ok-500 text-white',
  missed: 'bg-bad-500 text-white',
  open: 'border-2 border-dashed border-warn-500 text-warn-700',
  none: 'bg-slate-200 text-slate-400',
};
const ICON: Record<string, string> = { full: '✓', missed: '✕', open: '…', none: '·' };

/** Motivating "days in a row" card: flame + number, last 7 days as dots, next star. */
export default function StreakCard({ streak, compact = false }: { streak: Streak; compact?: boolean }) {
  const { t } = useT();
  const on = streak.current > 0;
  const milestone = streak.reached != null && streak.current === streak.reached;
  const weekday = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: 'narrow' });

  if (compact)
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${on ? 'bg-warn-100 text-warn-700' : 'bg-white/15'}`}>
        🔥 {on ? t('streakDays', { n: streak.current }) : t('streakTitle') + ': 0'}
      </span>
    );

  return (
    <section className={`card relative overflow-hidden ${milestone ? 'ring-4 ring-warn-500/40' : ''}`} aria-label={t('streakTitle')}>
      {milestone && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {['🎉', '⭐', '🎊', '✨', '⭐', '🎉'].map((e, i) => (
            <span key={i} className="absolute animate-float text-2xl" style={{ left: `${8 + i * 16}%`, top: `${10 + (i % 3) * 25}%`, animationDelay: `${i * 0.4}s` }}>
              {e}
            </span>
          ))}
        </div>
      )}
      <div className="relative flex flex-wrap items-center gap-5">
        <div className={`flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-3xl ${on ? 'bg-gradient-to-br from-warn-500 to-bad-500 text-white shadow-lift' : 'bg-slate-100 text-slate-400'}`}>
          <span className={`text-4xl ${on ? 'animate-float' : 'grayscale'}`} aria-hidden>
            🔥
          </span>
          <span className="text-3xl font-black leading-none">{streak.current}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-extrabold">{on ? t('streakDays', { n: streak.current }) : t('streakTitle')}</p>
          <p className="text-lg text-slate-600">
            {on && streak.next ? t('streakNext', { left: streak.next - streak.current, m: streak.next }) : on ? t('streakBest', { n: streak.best }) : t('streakStart')}
          </p>
          <div className="mt-3 flex gap-2" aria-label="Last 7 days">
            {streak.last7.map((d) => (
              <span key={d.date} className="flex flex-col items-center gap-1">
                <span className={`flex h-9 w-9 items-center justify-center rounded-full text-base font-bold ${DOT[d.state]}`} title={`${d.date}: ${d.state}`}>
                  {ICON[d.state]}
                </span>
                <span className="text-xs font-semibold text-slate-500">{weekday(d.date)}</span>
              </span>
            ))}
          </div>
        </div>
        {streak.best > streak.current && <p className="w-full text-sm font-semibold text-slate-500">{t('streakBest', { n: streak.best })}</p>}
      </div>
    </section>
  );
}
