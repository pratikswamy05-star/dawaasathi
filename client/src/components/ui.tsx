import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
type Size = 'md' | 'lg' | 'xl';

const VARIANT: Record<Variant, string> = {
  primary: 'border-transparent bg-gradient-to-r from-navy-800 via-navy-600 to-teal-600 bg-[length:200%_100%] bg-left text-white shadow-md hover:bg-right hover:shadow-glow',
  secondary: 'bg-white/90 text-navy-800 hover:bg-white hover:border-teal-500 border-slate-200 shadow-sm',
  success: 'border-transparent bg-gradient-to-r from-ok-600 to-ok-500 text-white shadow-md hover:shadow-lg hover:brightness-110',
  danger: 'border-transparent bg-gradient-to-r from-bad-600 to-bad-500 text-white shadow-md hover:shadow-lg hover:brightness-110',
  ghost: 'bg-transparent text-navy-800 hover:bg-navy-50 border-transparent',
};
const SIZE: Record<Size, string> = {
  md: 'min-h-[48px] px-4 text-base',
  lg: 'min-h-[60px] px-6 text-xl',
  xl: 'min-h-[76px] px-6 text-2xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border-2 font-bold transition-all duration-300 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    >
      {loading && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className = '', children, title, action }: { className?: string; children: ReactNode; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={`card animate-fade-in-up ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-lg font-extrabold tracking-tight text-navy-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

type Tone = 'green' | 'amber' | 'red' | 'navy' | 'slate';
const TONE: Record<Tone, string> = {
  green: 'bg-ok-50 text-ok-700 ring-ok-600/20',
  amber: 'bg-warn-50 text-warn-700 ring-warn-600/20',
  red: 'bg-bad-50 text-bad-700 ring-bad-600/20',
  navy: 'bg-navy-50 text-navy-800 ring-navy-600/20',
  slate: 'bg-slate-100 text-slate-700 ring-slate-400/20',
};

export function Badge({ tone = 'slate', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ring-inset ${TONE[tone]} ${className}`}>{children}</span>;
}

/** Counts up from 0 to the number when it first appears (non-numbers are shown as they are). */
export function CountUp({ value, ms = 900 }: { value: number; ms?: number }) {
  const [n, setN] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(a + (value - a) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{n}</>;
}

const STAT_GRADIENT: Record<Tone, string> = {
  green: 'from-ok-600 to-ok-500',
  amber: 'from-warn-600 to-warn-500',
  red: 'from-bad-600 to-bad-500',
  navy: 'from-navy-700 to-teal-600',
  slate: 'from-slate-600 to-slate-400',
};

export function StatCard({ label, value, tone = 'navy', icon }: { label: string; value: ReactNode; tone?: Tone; icon?: ReactNode }) {
  return (
    <div className="card card-hover group flex items-center gap-4">
      {icon && <div className={`icon-tile h-14 w-14 bg-gradient-to-br ${STAT_GRADIENT[tone]}`}>{icon}</div>}
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-3xl font-extrabold text-navy-900">{typeof value === 'number' ? <CountUp value={value} /> : value}</p>
      </div>
    </div>
  );
}

/** Animated circular progress (0–100). */
export function ProgressRing({ pct, size = 132, stroke = 12, children }: { pct: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(Math.max(0, Math.min(100, pct))));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.18)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ring-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c - (shown / 100) * c}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

export function Spinner({ label = 'Loading…', small = false }: { label?: string; small?: boolean }) {
  if (small)
    return (
      <p className="flex items-center gap-2 py-3 text-slate-500" role="status">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> {label}
      </p>
    );
  return (
    <div className="space-y-4 py-4" role="status" aria-label={label}>
      <div className="skeleton h-28 w-full" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="skeleton h-24" />
        <div className="skeleton h-24" />
        <div className="skeleton h-24" />
      </div>
      <div className="skeleton h-48 w-full" />
      <p className="flex items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> {label}
      </p>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-slate-500">
      <Inbox className="h-8 w-8" aria-hidden />
      <p className="font-semibold text-navy-800">{title}</p>
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 border-bad-600/30 bg-bad-50 text-center" role="alert">
      <AlertCircle className="h-8 w-8 text-bad-600" aria-hidden />
      <p className="font-semibold text-bad-700">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex animate-fade-in-up flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 md:text-3xl">{title}</h1>
        <div className="mt-2 h-1 w-16 rounded-full bg-gradient-to-r from-navy-600 to-teal-500" aria-hidden />
        {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, error, children, htmlFor }: { label: string; error?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const riskTone = (l: string): Tone => (l === 'high' ? 'red' : l === 'medium' ? 'amber' : 'green');
export const stockTone = (s: string): Tone => (s === 'critical' ? 'red' : s === 'soon' ? 'amber' : 'green');
export const stockDot = (s: string) => (s === 'critical' ? '🔴' : s === 'soon' ? '🟡' : '🟢');
export const riskLabel = (l: string) => (l === 'high' ? '🔴 High' : l === 'medium' ? '🟡 Medium' : '🟢 Low');
