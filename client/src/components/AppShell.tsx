import {
  AlertTriangle,
  BarChart3,
  Bell,
  ClipboardList,
  FileText,
  HeartPulse,
  ScanLine,
  Store,
  Video,
  History,
  Home,
  LogOut,
  MessageCircle,
  PhoneCall,
  Database,
  CreditCard,
  Route,
  Package,
  Pill,
  ShieldCheck,
  Users,
  WifiOff,
} from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { usePatientReminders } from '../hooks/usePatientReminders';
import { LANGS, useT, type TKey } from '../i18n';
import { askNotificationPermission } from '../lib/speech';
import { useOnline, usePendingSync } from '../lib/offline';
import { useAuth } from '../store/auth';
import type { Lang, Role, User } from '../types';
import DemoPanel from './DemoPanel';
import HelpButton from './HelpButton';
import NotificationBell from './NotificationBell';
import ReminderCall from './ReminderCall';
import VoiceAssistant from './VoiceAssistant';

interface NavItem {
  to: string;
  label: string;
  tKey?: TKey;
  icon: ReactNode;
}

const NAV: Record<Role, NavItem[]> = {
  patient: [
    { to: '/patient/dashboard', label: 'Home', tKey: 'home', icon: <Home aria-hidden /> },
    { to: '/patient/today', label: 'Today', tKey: 'today', icon: <ClipboardList aria-hidden /> },
    { to: '/patient/reminders', label: 'Reminder calls', tKey: 'voiceReminders', icon: <PhoneCall aria-hidden /> },
    { to: '/patient/card', label: 'Emergency card', tKey: 'emergencyCard', icon: <CreditCard aria-hidden /> },
    { to: '/patient/vitals', label: 'Readings', tKey: 'vitals', icon: <HeartPulse aria-hidden /> },
    { to: '/patient/doctor', label: 'Doctor', tKey: 'doctorCall', icon: <Video aria-hidden /> },
    { to: '/patient/scan', label: 'Scan', tKey: 'scanMedicine', icon: <ScanLine aria-hidden /> },
    { to: '/patient/medicines', label: 'Medicines', tKey: 'myMedicines', icon: <Pill aria-hidden /> },
    { to: '/patient/history', label: 'History', tKey: 'history', icon: <History aria-hidden /> },
    { to: '/patient/refills', label: 'Refills', tKey: 'refills', icon: <Package aria-hidden /> },
    { to: '/patient/pharmacy', label: 'Pharmacy', tKey: 'pharmacy', icon: <Store aria-hidden /> },
    { to: '/patient/ask', label: 'Ask', tKey: 'ask', icon: <MessageCircle aria-hidden /> },
  ],
  caregiver: [
    { to: '/caregiver/dashboard', label: 'Dashboard', tKey: 'home', icon: <Home aria-hidden /> },
    { to: '/caregiver/reminders', label: 'Reminder calls', tKey: 'voiceReminders', icon: <PhoneCall aria-hidden /> },
    { to: '/caregiver/doctor', label: 'Doctor', tKey: 'doctorCall', icon: <Video aria-hidden /> },
    { to: '/caregiver/scan', label: 'Scan', tKey: 'scanMedicine', icon: <ScanLine aria-hidden /> },
    { to: '/caregiver/pharmacy', label: 'Pharmacy', tKey: 'pharmacy', icon: <Store aria-hidden /> },
    { to: '/caregiver/ask', label: 'Ask', tKey: 'ask', icon: <MessageCircle aria-hidden /> },
  ],
  asha: [
    { to: '/asha/dashboard', label: 'Dashboard', icon: <BarChart3 aria-hidden /> },
    { to: '/asha/visits', label: "Today's visits", icon: <Route aria-hidden /> },
    { to: '/asha/patients', label: 'Patients', icon: <Users aria-hidden /> },
    { to: '/asha/alerts', label: 'Alerts', icon: <Bell aria-hidden /> },
    { to: '/asha/reminders', label: 'Reminder calls', icon: <PhoneCall aria-hidden /> },
    { to: '/asha/doctor', label: 'Doctor calls', icon: <Video aria-hidden /> },
    { to: '/asha/scan', label: 'Scan medicine', icon: <ScanLine aria-hidden /> },
    { to: '/asha/pharmacy', label: 'Jan Aushadhi', icon: <Store aria-hidden /> },
  ],
  doctor: [
    { to: '/doctor/dashboard', label: 'Dashboard', icon: <BarChart3 aria-hidden /> },
    { to: '/doctor/patients', label: 'Patients', icon: <Users aria-hidden /> },
    { to: '/doctor/prescriptions', label: 'Prescriptions', icon: <Pill aria-hidden /> },
    { to: '/doctor/reports', label: 'Reports', icon: <FileText aria-hidden /> },
    { to: '/doctor/teleconsults', label: 'Video calls', icon: <Video aria-hidden /> },
    { to: '/doctor/reminders', label: 'Reminder calls', icon: <PhoneCall aria-hidden /> },
    { to: '/doctor/scan', label: 'Scan medicine', icon: <ScanLine aria-hidden /> },
  ],
  admin: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: <BarChart3 aria-hidden /> },
    { to: '/admin/users', label: 'Users', icon: <Users aria-hidden /> },
    { to: '/admin/database', label: 'Database', icon: <Database aria-hidden /> },
    { to: '/asha/patients', label: 'Patients', icon: <ShieldCheck aria-hidden /> },
    { to: '/asha/alerts', label: 'Alerts', icon: <AlertTriangle aria-hidden /> },
  ],
};

const ROLE_LABEL: Record<Role, string> = { patient: 'Patient', caregiver: 'Caregiver', asha: 'ASHA worker', doctor: 'Doctor', admin: 'Admin' };

export function LanguageSelect() {
  const { lang, t } = useT();
  const setLang = useAuth((s) => s.setLang);
  const token = useAuth((s) => s.token);
  const change = (l: Lang) => {
    setLang(l);
    if (token) void api<{ user: User }>('/auth/me', { method: 'PATCH', body: { language: l } }).catch(() => undefined);
  };
  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">{t('language')}</span>
      <select className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 font-semibold" value={lang} onChange={(e) => change(e.target.value as Lang)}>
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function OfflineBanner() {
  const online = useOnline();
  const pending = usePendingSync();
  const { t } = useT();
  if (online && !pending) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-warn-50 px-4 py-2 text-center font-semibold text-warn-700" role="status">
      <WifiOff className="h-5 w-5" aria-hidden />
      {!online ? t('offline') : t('pendingSync', { n: pending })}
    </div>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const { t } = useT();
  const nav = useNavigate();
  const location = useLocation();
  const role = user!.role;
  const items = NAV[role];
  usePatientReminders(role === 'patient' ? user!.patientId : null);

  useEffect(() => {
    if (role === 'patient' || role === 'caregiver') void askNotificationPermission();
  }, [role]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/60 bg-white/75 shadow-sm backdrop-blur-lg">
        <OfflineBanner />
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="flex h-11 w-11 animate-gradient-x items-center justify-center rounded-2xl bg-gradient-to-br from-navy-800 via-navy-600 to-teal-500 bg-[length:200%_200%] text-2xl font-black text-white shadow-md" aria-hidden>
              +
            </div>
            <div>
              <p className="gradient-text text-lg font-extrabold leading-tight">DawaaSathi</p>
              <p className="text-xs font-medium text-slate-500">
                {user!.name} · {ROLE_LABEL[role]}
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <LanguageSelect />
            <NotificationBell />
            <button
              onClick={() => {
                logout();
                // Back to the same login screen the user belongs to.
                nav(`/login/${role === 'doctor' || role === 'admin' ? 'staff' : role}`);
              }}
              className="flex h-12 items-center gap-1 rounded-xl px-3 font-semibold hover:bg-navy-50"
              aria-label={t('logout')}
            >
              <LogOut aria-hidden />
              <span className="hidden sm:inline">{t('logout')}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4">
        {items.length > 1 && (
          <nav className="sticky top-24 hidden h-fit w-60 shrink-0 py-6 md:block" aria-label="Main">
            <ul className="card stagger space-y-1 p-2">
              {items.map((n) => (
                <li key={n.to}>
                  <NavLink
                    to={n.to}
                    className={({ isActive }) =>
                      `flex min-h-[48px] items-center gap-3 rounded-xl px-3 font-semibold transition-all duration-300 ${isActive ? 'bg-gradient-to-r from-navy-800 to-teal-600 text-white shadow-md' : 'text-navy-800 hover:translate-x-1 hover:bg-navy-50'}`
                    }
                  >
                    {n.icon} {n.tKey ? t(n.tKey) : n.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <main className="min-w-0 flex-1 py-6 pb-40 md:pb-16">
          {/* Re-keyed per page so every screen slides in. */}
          <div key={location.pathname} className="animate-fade-in-up">
            <Outlet />
          </div>
        </main>
      </div>

      {items.length > 1 && (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/60 bg-white/85 shadow-[0_-8px_24px_-12px_rgba(13,27,51,.25)] backdrop-blur-lg md:hidden" aria-label="Main">
          <ul className="flex overflow-x-auto">
            {items.map((n) => (
              <li key={n.to} className="min-w-[76px] flex-1">
                <NavLink
                  to={n.to}
                  className={({ isActive }) =>
                    `flex min-h-[68px] flex-col items-center justify-center text-xs font-bold transition-all ${isActive ? '-translate-y-1 text-teal-600' : 'text-slate-500'}`
                  }
                >
                  {n.icon}
                  <span className="mt-1">{n.tKey ? t(n.tKey) : n.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {role === 'patient' && <HelpButton patientId={user!.patientId} />}
      {role === 'patient' && <ReminderCall />}
      {role === 'patient' && <VoiceAssistant />}
      <DemoPanel />
    </div>
  );
}
