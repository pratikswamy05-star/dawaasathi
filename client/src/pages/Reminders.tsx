import { Clock, Languages, PhoneCall, Play, Save, Trash2, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errorText } from '../api/client';
import VoiceRecorder from '../components/VoiceRecorder';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useT } from '../i18n';
import { dateTimeOf } from '../lib/format';
import { ALL_REMINDER_LANGS, isReminderLang, REMINDER_LANGS, reminderSentence, type ReminderLang } from '../lib/reminderLangs';
import { speakSequence, voiceReport } from '../lib/speech';
import { useAuth } from '../store/auth';
import { useReminderCall } from '../store/reminderCall';
import { toast } from '../store/toast';
import type { Dose, PatientSummary, ReminderRx, VoiceReminder } from '../types';

const FOOD: Record<string, string> = { before: 'before food', after: 'after food', with: 'with food', none: 'any time' };

function playVoice(v: VoiceReminder) {
  if (!v.audio_base64) return;
  void new Audio(`data:${v.mime};base64,${v.audio_base64}`).play().catch(() => toast.error('Could not play this recording'));
}

function VoiceList({ voices, canDelete, onChanged }: { voices: VoiceReminder[]; canDelete: (v: VoiceReminder) => boolean; onChanged: () => void }) {
  if (!voices.length) return null;
  const del = async (id: number) => {
    if (!window.confirm('Delete this voice reminder?')) return;
    try {
      await api(`/voice-reminders/${id}`, { method: 'DELETE' });
      toast.success('Deleted');
      onChanged();
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  return (
    <ul className="mb-3 space-y-2">
      {voices.map((v) => (
        <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-navy-50 p-2">
          <Button variant="secondary" onClick={() => playVoice(v)} aria-label="Play recording">
            <Play className="h-4 w-4" aria-hidden /> {v.duration_sec}s
          </Button>
          <span className="font-semibold">
            🎙️ {v.recorded_by_name ?? 'Unknown'}
            {v.recorded_by_relation ? ` (${v.recorded_by_relation})` : ''}
          </span>
          {v.language && isReminderLang(v.language) && <Badge tone="navy">{REMINDER_LANGS[v.language].native}</Badge>}
          <span className="text-sm text-slate-500">{dateTimeOf(v.created_at)}</span>
          {canDelete(v) && (
            <Button variant="ghost" className="ml-auto" onClick={() => del(v.id)} aria-label="Delete recording">
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function TimesEditor({ patientId, rx, onSaved }: { patientId: number; rx: ReminderRx; onSaved: () => void }) {
  const [times, setTimes] = useState(rx.times);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timesKey = rx.times.join();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setTimes(rx.times), [timesKey]);
  const changed = times.join() !== rx.times.join();

  const save = async () => {
    setErr(null);
    setBusy(true);
    try {
      await api(`/patients/${patientId}/reminders/times/${rx.id}`, { method: 'PUT', body: { times } });
      toast.success('Reminder time saved. Everyone has been informed.');
      onSaved();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        {times.map((tm, i) => (
          <label key={i}>
            <span className="label text-sm">Dose {i + 1}</span>
            <input
              type="time"
              className="input w-36"
              value={tm}
              onChange={(e) => setTimes(times.map((x, j) => (j === i ? e.target.value : x)))}
              aria-label={`Reminder time for dose ${i + 1}`}
            />
          </label>
        ))}
        {changed && (
          <Button onClick={save} loading={busy}>
            <Save className="h-4 w-4" aria-hidden /> Save time
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">You can move the time. The number of doses stays as the doctor prescribed.</p>
      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

function LanguagePicker({ patientId, current, onSaved }: { patientId: number; current: ReminderLang[]; onSaved: () => void }) {
  const [sel, setSel] = useState<ReminderLang[]>(current);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Record<string, string | null> | null>(null);
  // Which languages this browser can really speak (voices load asynchronously, Edge adds online voices).
  useEffect(() => {
    let live = true;
    const tags = Object.fromEntries(ALL_REMINDER_LANGS.map((l) => [l, REMINDER_LANGS[l].tag]));
    const run = () => void voiceReport(tags).then((r) => live && setReport(r));
    run();
    window.speechSynthesis?.addEventListener?.('voiceschanged', run);
    return () => {
      live = false;
      window.speechSynthesis?.removeEventListener?.('voiceschanged', run);
    };
  }, []);

  const toggle = (l: ReminderLang) => setSel((s) => (s.includes(l) ? s.filter((x) => x !== l) : s.length >= 3 ? s : [...s, l]));
  const changed = sel.join() !== current.join();
  const sample = (l: ReminderLang) => void speakSequence([{ text: reminderSentence(l, REMINDER_LANGS[l].sample, 'after'), tag: REMINDER_LANGS[l].tag }]);
  const missing = report ? sel.filter((l) => !report[l]) : [];

  const save = async () => {
    if (!sel.length) return toast.error('Choose at least one language');
    setBusy(true);
    try {
      await api(`/patients/${patientId}/reminders/languages`, { method: 'PUT', body: { languages: sel } });
      toast.success('Reminder languages saved');
      onSaved();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2 text-xl">
          <Languages aria-hidden /> Reminder language
        </span>
      }
    >
      <p className="mb-3 text-slate-600">Tap up to 3 languages in the order they should be spoken. The reminder call reads the medicine in each one.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Reminder languages">
        {ALL_REMINDER_LANGS.map((l) => {
          const i = sel.indexOf(l);
          return (
            <button
              key={l}
              type="button"
              aria-pressed={i >= 0}
              onClick={() => toggle(l)}
              className={`flex min-h-[52px] items-center gap-2 rounded-xl border-2 px-4 text-lg font-semibold ${i >= 0 ? 'border-navy-800 bg-navy-800 text-white' : 'border-slate-300 bg-white text-navy-800'}`}
            >
              {i >= 0 && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-bold text-navy-800">{i + 1}</span>}
              {REMINDER_LANGS[l].native}
              <span className={`text-sm ${i >= 0 ? 'text-navy-100' : 'text-slate-500'}`}>{REMINDER_LANGS[l].name !== REMINDER_LANGS[l].native ? REMINDER_LANGS[l].name : ''}</span>
              {report && <span title={report[l] ?? 'No voice on this browser'}>{report[l] ? '🔊' : '🔇'}</span>}
            </button>
          );
        })}
      </div>
      {sel.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="font-semibold">Order:</span>
          {sel.map((l, i) => (
            <button key={l} type="button" onClick={() => sample(l)} className="flex items-center gap-1 rounded-full bg-navy-50 px-3 py-1 font-semibold text-navy-800 hover:bg-navy-100">
              {i + 1}. {REMINDER_LANGS[l].native} <Volume2 className="h-4 w-4" aria-label="Hear sample" />
            </button>
          ))}
          <Button variant="ghost" onClick={() => void speakSequence(sel.map((l) => ({ text: reminderSentence(l, REMINDER_LANGS[l].sample, 'after'), tag: REMINDER_LANGS[l].tag })))}>
            ▶ Hear all
          </Button>
          {changed && (
            <Button onClick={save} loading={busy} className="ml-auto">
              <Save className="h-4 w-4" aria-hidden /> Save languages
            </Button>
          )}
        </div>
      )}
      {missing.length > 0 && (
        <div className="mt-3 rounded-xl bg-warn-50 p-3 text-warn-700">
          <p className="font-bold">🔇 This browser has no {missing.map((l) => REMINDER_LANGS[l].name).join(' / ')} voice, so that part is shown as text instead of spoken.</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            <li>
              <strong>Easiest:</strong> open the app in <strong>Microsoft Edge</strong> — it has natural Kannada, Hindi, Tamil, Telugu and Marathi voices (needs internet).
            </li>
            <li>
              <strong>Android phone:</strong> Chrome uses the phone's Google voices — Settings → Text-to-speech → Google → install the language.
            </li>
            <li>
              <strong>Always works:</strong> the caregiver / ASHA records a voice message in that language — it plays on any device.
            </li>
          </ul>
        </div>
      )}
      {report && (
        <details className="mt-3 text-sm text-slate-600">
          <summary className="cursor-pointer font-semibold">Voice check for this browser</summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {ALL_REMINDER_LANGS.map((l) => (
              <li key={l}>
                {report[l] ? '✅' : '❌'} {REMINDER_LANGS[l].name}: <span className="text-slate-500">{report[l] ?? 'no voice installed'}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

export default function Reminders() {
  const { t } = useT();
  const user = useAuth((s) => s.user!);
  const isPatient = user.role === 'patient';
  const [params, setParams] = useSearchParams();
  const { data: pts } = useApi<{ patients: PatientSummary[] }>(isPatient ? null : '/patients');
  const chosen = isPatient ? user.patientId : Number(params.get('patient')) || null;
  const { data, loading, error, reload } = useApi<{ languages: string[]; prescriptions: ReminderRx[]; voices: VoiceReminder[] }>(chosen ? `/patients/${chosen}/reminders?audio=1` : null);
  const { data: doses } = useApi<{ doses: Dose[] }>(isPatient && chosen ? `/patients/${chosen}/doses` : null);
  const ring = useReminderCall((s) => s.ring);
  const langs = ((data as { languages?: string[] } | null)?.languages ?? []).filter(isReminderLang);
  const [recLang, setRecLang] = useState<ReminderLang | ''>('');
  const recordLang = recLang || langs[0] || 'en';

  useEffect(() => {
    if (!isPatient && !chosen && pts?.patients.length === 1) setParams({ patient: String(pts.patients[0].id) }, { replace: true });
  }, [isPatient, chosen, pts, setParams]);

  const canDelete = (v: VoiceReminder) => v.recorded_by === user.id || ['doctor', 'asha', 'admin'].includes(user.role);
  const canEditTimes = !isPatient;

  const testCall = () => {
    const list = doses?.doses ?? [];
    const d = list.find((x) => x.status === 'pending') ?? list[0];
    if (!d) return toast.info('No medicine scheduled today to test with.');
    ring(d, 0, true);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title={`📞 ${t('voiceReminders')}`}
        subtitle={isPatient ? t('voiceRemindersHelp') : 'Set medicine times and record a voice message. At that time the patient’s phone rings like a call and plays your voice.'}
        action={
          isPatient && (
            <Button size="lg" onClick={testCall}>
              <PhoneCall aria-hidden /> {t('testCall')}
            </Button>
          )
        }
      />

      {!isPatient && (
        <Card>
          <label className="block">
            <span className="label">Patient</span>
            <select className="input" value={chosen ?? ''} onChange={(e) => setParams(e.target.value ? { patient: e.target.value } : {})}>
              <option value="">Choose…</option>
              {pts?.patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </Card>
      )}

      {!chosen ? (
        <EmptyState title="Choose a patient" />
      ) : loading && !data ? (
        <Spinner />
      ) : error && !data ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : data ? (
        <>
          <LanguagePicker patientId={chosen} current={langs} onSaved={() => void reload()} />

          {!isPatient && (
            <Card>
              <label className="flex flex-wrap items-center gap-3">
                <span className="label mb-0">🎙️ Language you will record in</span>
                <select className="input w-auto" value={recordLang} onChange={(e) => setRecLang(e.target.value as ReminderLang)}>
                  {ALL_REMINDER_LANGS.map((l) => (
                    <option key={l} value={l}>
                      {REMINDER_LANGS[l].native} ({REMINDER_LANGS[l].name})
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-1 text-sm text-slate-500">You can record one message per medicine in each language. The call plays the one in the patient's first language.</p>
            </Card>
          )}

          <Card title={<span className="text-xl">🎙️ Message for all medicines</span>}>
            <VoiceList voices={data.voices.filter((v) => v.prescription_id == null)} canDelete={canDelete} onChanged={() => void reload()} />
            <VoiceRecorder
              patientId={chosen}
              prescriptionId={null}
              language={recordLang}
              hint="Used when a medicine has no message of its own. E.g. “Amma, this is Ravi. It’s time for your medicine. Please take it with water and press TAKEN.”"
              onSaved={() => void reload()}
            />
          </Card>

          {!data.prescriptions.length && <EmptyState title="No active medicines" />}
          {data.prescriptions.map((rx) => (
            <Card
              key={rx.id}
              title={
                <span className="flex flex-wrap items-center gap-2 text-xl">
                  💊 {rx.medication_name} {rx.dosage}
                  <Badge tone="slate">{FOOD[rx.food_rule] ?? rx.food_rule}</Badge>
                </span>
              }
            >
              <p className="mb-3 flex flex-wrap items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-navy-600" aria-hidden />
                Rings at <strong>{rx.times.join(', ')}</strong>
                <span className="text-sm text-slate-500">· prescribed by {rx.prescriber_name}</span>
              </p>
              {canEditTimes && <TimesEditor patientId={chosen} rx={rx} onSaved={() => void reload()} />}
              <div className="mt-4">
                <VoiceList voices={data.voices.filter((v) => v.prescription_id === rx.id)} canDelete={canDelete} onChanged={() => void reload()} />
                {!isPatient && (
                  <VoiceRecorder
                    patientId={chosen}
                    prescriptionId={rx.id}
                    language={recordLang}
                    hint={`Say the medicine and how to take it, e.g. “Amma, it’s time for ${rx.medication_name}, one tablet ${FOOD[rx.food_rule] ?? ''}.” Never ask for an extra dose.`}
                    onSaved={() => void reload()}
                  />
                )}
              </div>
            </Card>
          ))}
        </>
      ) : null}
    </div>
  );
}
