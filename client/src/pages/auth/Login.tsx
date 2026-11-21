/**
 * Separate login screens per user group:
 *   /login            → "Who is logging in?" chooser
 *   /login/patient    → extra-large, voice-guided, elder-friendly
 *   /login/caregiver  → family members
 *   /login/asha       → ASHA workers (accounts created by admin)
 *   /login/staff      → doctors and admins
 * The server also checks the portal, so an account can only sign in through its own screen.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Eye, EyeOff, HeartHandshake, Stethoscope, User, Users, Volume2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { api, ApiError, errorText } from '../../api/client';
import { LanguageSelect } from '../../components/AppShell';
import { HOME } from '../../components/ProtectedRoute';
import { Button, Field } from '../../components/ui';
import { useT, type TKey } from '../../i18n';
import { speak } from '../../lib/speech';
import { useAuth } from '../../store/auth';
import { toast } from '../../store/toast';
import type { User as UserT } from '../../types';

export type Portal = 'patient' | 'caregiver' | 'asha' | 'staff';

interface PortalConfig {
  title: TKey;
  label: TKey;
  sub: TKey;
  icon: ReactNode;
  /** Tailwind classes for the portal's accent colour. */
  accent: string;
  ring: string;
  large: boolean;
  canRegister: boolean;
  demo: [string, string, string][];
}

export const PORTALS: Record<Portal, PortalConfig> = {
  patient: {
    title: 'patientLogin',
    label: 'portalPatient',
    sub: 'portalPatientSub',
    icon: <User className="h-10 w-10" aria-hidden />,
    accent: 'bg-gradient-to-br from-ok-600 to-teal-500 text-white',
    ring: 'border-ok-600',
    large: true,
    canRegister: true,
    demo: [
      ['Lakshmi', '9400000001', 'Patient@123'],
      ['Ramesh', '9400000002', 'Patient@123'],
    ],
  },
  caregiver: {
    title: 'caregiverLogin',
    label: 'portalCaregiver',
    sub: 'portalCaregiverSub',
    icon: <HeartHandshake className="h-10 w-10" aria-hidden />,
    accent: 'bg-gradient-to-br from-warn-600 to-warn-500 text-white',
    ring: 'border-warn-600',
    large: true,
    canRegister: true,
    demo: [
      ['Ravi (son of Lakshmi)', '9300000001', 'Care@123'],
      ['Meena (daughter of Ramesh)', '9300000002', 'Care@123'],
    ],
  },
  asha: {
    title: 'ashaLogin',
    label: 'portalAsha',
    sub: 'portalAshaSub',
    icon: <Users className="h-10 w-10" aria-hidden />,
    accent: 'bg-gradient-to-br from-[#be185d] to-[#f472b6] text-white',
    ring: 'border-[#be185d]',
    large: false,
    canRegister: false,
    demo: [
      ['Shobha (Gorur – Belur)', '9200000001', 'Asha@123'],
      ['Latha (Arsikere)', '9200000002', 'Asha@123'],
    ],
  },
  staff: {
    title: 'staffLogin',
    label: 'portalStaff',
    sub: 'portalStaffSub',
    icon: <Stethoscope className="h-10 w-10" aria-hidden />,
    accent: 'bg-gradient-to-br from-navy-800 to-navy-500 text-white',
    ring: 'border-navy-800',
    large: false,
    canRegister: false,
    demo: [
      ['Dr. Kavya Rao (PHC Gorur)', '9100000001', 'Doctor@123'],
      ['Dr. Imran Khan (CHC Arsikere)', '9100000002', 'Doctor@123'],
      ['Admin', '9000000001', 'Admin@123'],
    ],
  },
};

const ORDER: Portal[] = ['patient', 'caregiver', 'asha', 'staff'];

function Brand() {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 animate-gradient-x items-center justify-center rounded-2xl bg-gradient-to-br from-navy-800 via-navy-600 to-teal-500 bg-[length:200%_200%] text-2xl font-black text-white shadow-lg" aria-hidden>
          +
        </div>
        <p className="gradient-text text-2xl font-extrabold">DawaaSathi</p>
      </div>
      <LanguageSelect />
    </div>
  );
}

/** Soft animated colour blobs behind the login screens. */
export function AuthBackground({ children }: { children: ReactNode }) {
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute -left-24 -top-24 h-96 w-96 animate-blob rounded-full bg-teal-400/30 blur-3xl" />
        <div className="absolute -right-24 top-1/3 h-[28rem] w-[28rem] animate-blob rounded-full bg-navy-400/25 blur-3xl [animation-delay:-5s]" />
        <div className="absolute -bottom-32 left-1/4 h-96 w-96 animate-blob rounded-full bg-ok-500/20 blur-3xl [animation-delay:-9s]" />
      </div>
      {children}
    </main>
  );
}

/** /login — pick who you are. Big cards, icons and colour, so it works for people who read little. */
export function LoginChooser() {
  const { t } = useT();
  const { token, user } = useAuth();
  if (token && user) return <Navigate to={HOME[user.role]} replace />;
  return (
    <AuthBackground>
      <div className="w-full max-w-2xl space-y-6">
        <Brand />
        <div className="animate-fade-in-up">
          <p className="text-sm font-bold uppercase tracking-[.2em] text-teal-600">Smart · Accessible · Patient-centric</p>
          <h1 className="mt-1 text-4xl font-black tracking-tight text-navy-900">{t('whoAreYou')}</h1>
        </div>
        <div className="stagger grid gap-4 sm:grid-cols-2">
          {ORDER.map((p) => {
            const c = PORTALS[p];
            return (
              <Link
                key={p}
                to={`/login/${p}`}
                className={`card group flex min-h-[120px] items-center gap-4 border-2 border-transparent hover:border-teal-500 ${p === 'patient' ? 'sm:col-span-2' : ''}`}
              >
                <span className={`icon-tile h-16 w-16 shrink-0 ${c.accent}`}>{c.icon}</span>
                <span className="flex-1">
                  <span className="block text-2xl font-extrabold">{t(c.label)}</span>
                  <span className="block text-lg text-slate-600">{t(c.sub)}</span>
                </span>
                <span className="text-3xl text-slate-300 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-teal-500" aria-hidden>
                  ›
                </span>
              </Link>
            );
          })}
        </div>
        <p className="animate-fade-in text-center text-sm text-slate-500">💊 Right medicine · ⏰ right time · 👨‍👩‍👧 family & ASHA in the loop · 🩺 doctor informed</p>
      </div>
    </AuthBackground>
  );
}

const schema = z.object({
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number'),
  password: z.string().min(1, 'Enter your password'),
});
type V = z.infer<typeof schema>;

/** /login/:portal — one screen per user group. Patient & caregiver screens are larger and voice-guided. */
export function PortalLogin({ portal }: { portal: Portal }) {
  const { t, lang } = useT();
  const { token, user, login } = useAuth();
  const nav = useNavigate();
  const c = PORTALS[portal];
  const [show, setShow] = useState(false);
  const [wrongPortal, setWrongPortal] = useState<Portal | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<V>({ resolver: zodResolver(schema) });

  if (token && user) return <Navigate to={HOME[user.role]} replace />;

  const submit = async (v: V) => {
    setWrongPortal(null);
    try {
      const r = await api<{ token: string; user: UserT }>('/auth/login', { method: 'POST', body: { ...v, portal } });
      login(r.token, r.user);
      nav(HOME[r.user.role], { replace: true });
    } catch (e) {
      const target = e instanceof ApiError ? (e.details as unknown as { portal?: Portal } | undefined)?.portal : undefined;
      if (target && target !== portal) setWrongPortal(target);
      toast.error(errorText(e));
    }
  };

  const inputSize = c.large ? 'text-2xl min-h-[64px]' : 'text-lg';

  return (
    <AuthBackground>
      <div className="w-full max-w-md space-y-5">
        <Brand />
        <form onSubmit={handleSubmit(submit)} noValidate className={`card animate-scale-in space-y-5 border-t-8 ${c.ring}`}>
          <div className="flex items-center gap-3">
            <span className={`icon-tile h-14 w-14 animate-float ${c.accent}`}>{c.icon}</span>
            <h1 className={`${c.large ? 'text-3xl' : 'text-2xl'} font-extrabold`}>{t(c.title)}</h1>
          </div>

          {c.large && (
            <Button type="button" variant="secondary" className="w-full" onClick={() => speak(t('loginHelpSpeech'), lang)}>
              <Volume2 aria-hidden /> {t('listenHelp')}
            </Button>
          )}

          <Field label={t('phone')} htmlFor="phone" error={errors.phone?.message}>
            <input id="phone" className={`input ${inputSize}`} inputMode="numeric" autoComplete="tel-national" maxLength={10} {...register('phone')} />
          </Field>
          <Field label={t('password')} htmlFor="password" error={errors.password?.message}>
            <div className="relative">
              <input
                id="password"
                type={show ? 'text' : 'password'}
                className={`input pr-14 ${inputSize}`}
                autoComplete="current-password"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg hover:bg-slate-100"
                aria-label={show ? t('hidePassword') : t('showPassword')}
              >
                {show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </button>
            </div>
          </Field>

          {wrongPortal && (
            <Link to={`/login/${wrongPortal}`} onClick={() => setWrongPortal(null)} className="block rounded-xl bg-warn-50 p-3 text-center font-bold text-warn-700 underline">
              {t('useThisLogin')}: {t(PORTALS[wrongPortal].title)} →
            </Link>
          )}

          <Button type="submit" size={c.large ? 'xl' : 'lg'} className="w-full" loading={isSubmitting}>
            {t('login')}
          </Button>

          {c.canRegister ? (
            <Link to={`/register?role=${portal}`} className="block text-center text-lg font-semibold text-navy-600 underline">
              {t('newAccount')}
            </Link>
          ) : (
            <p className="text-center text-slate-600">{t('staffNote')}</p>
          )}
          <Link to="/login" className="flex items-center justify-center gap-1 font-semibold text-slate-600 hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden /> {t('changeLogin')}
          </Link>
        </form>

        <div className="card animate-fade-in-up [animation-delay:150ms]">
          <p className="mb-2 font-semibold">{t('demoAccounts')}</p>
          <div className="stagger grid gap-2">
            {c.demo.map(([label, phone, pw]) => (
              <button
                key={phone}
                type="button"
                className="flex min-h-[48px] items-center justify-between rounded-xl border border-slate-200 bg-white/70 px-3 text-left transition hover:-translate-y-0.5 hover:border-teal-500 hover:shadow-md"
                onClick={() => {
                  setValue('phone', phone, { shouldValidate: true });
                  setValue('password', pw, { shouldValidate: true });
                }}
              >
                <span className="font-semibold">{label}</span>
                <span className="text-sm text-slate-500">{phone}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </AuthBackground>
  );
}
