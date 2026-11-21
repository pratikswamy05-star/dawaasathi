import { Phone, PhoneOff, Pill, RotateCcw, Utensils } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { useConfirmDose } from '../hooks/useConfirmDose';
import { useT } from '../i18n';
import { timeOf } from '../lib/format';
import { startRing, stopRing } from '../lib/ringtone';
import { isReminderLang, REMINDER_LANGS, reminderSentence, type ReminderLang } from '../lib/reminderLangs';
import { speakSequence } from '../lib/speech';
import { useAuth } from '../store/auth';
import { useReminderCall } from '../store/reminderCall';
import { toast } from '../store/toast';
import type { ReminderRx, VoiceReminder } from '../types';

const RING_SECONDS = 60;
const SNOOZE_MINUTES = 10;
const ROLE_NAME: Record<string, string> = { caregiver: 'Family', asha: 'ASHA worker', doctor: 'Doctor', patient: 'You', admin: 'PHC' };

/**
 * Full-screen "incoming call" at medicine time. Plays the voice message recorded by the caregiver / ASHA / doctor
 * for this medicine (or their general message), then reads the medicine details aloud. Works offline from cache.
 */
export default function ReminderCall() {
  const { t } = useT();
  const patientId = useAuth((s) => s.user?.patientId ?? null);
  const { dose, stage, test, ring, hangUp } = useReminderCall();
  const { data, reload } = useApi<{ languages: string[]; prescriptions: ReminderRx[]; voices: VoiceReminder[] }>(patientId ? `/patients/${patientId}/reminders?audio=1` : null, {
    cacheKey: patientId ? `voice-reminders-${patientId}` : undefined,
  });
  const [answered, setAnswered] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { confirm, busyId } = useConfirmDose(() => {
    window.dispatchEvent(new Event('data-synced'));
    end();
  });

  // Languages chosen by the patient / family, spoken in this order.
  const langs: ReminderLang[] = (data?.languages ?? []).filter(isReminderLang);
  if (!langs.length) langs.push(isReminderLang(useAuth.getState().lang) ? (useAuth.getState().lang as ReminderLang) : 'en');
  const primary = langs[0];

  // Recording priority: this medicine in the first language → this medicine (any language)
  // → general message in the first language → any general message. Newest first.
  const voice = (() => {
    if (!dose || !data) return null;
    const usable = data.voices.filter((v) => v.audio_base64);
    const forRx = usable.filter((v) => v.prescription_id === dose.prescription_id);
    const general = usable.filter((v) => v.prescription_id == null);
    return forRx.find((v) => v.language === primary) ?? forRx[0] ?? general.find((v) => v.language === primary) ?? general[0] ?? null;
  })();
  const caller = voice?.recorded_by_name
    ? `${voice.recorded_by_name}${voice.recorded_by_relation ? ` (${voice.recorded_by_relation})` : voice.recorded_by_role ? ` · ${ROLE_NAME[voice.recorded_by_role] ?? ''}` : ''}`
    : 'DawaaSathi';

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
    setPlaying(false);
  };

  function end() {
    stopRing();
    stopAudio();
    setAnswered(false);
    hangUp();
  }

  // Ring when a call arrives; give up after RING_SECONDS (the server escalation continues as usual).
  useEffect(() => {
    if (!dose) return;
    void reload();
    setAnswered(false);
    startRing();
    const id = setTimeout(() => {
      if (!useReminderCall.getState().dose) return;
      stopRing();
      toast.info(`📞 ${t('missedCall')}: ${dose.medication_name}`);
      hangUp();
    }, RING_SECONDS * 1000);
    return () => {
      clearTimeout(id);
      stopRing();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dose?.id]);

  if (!dose) return null;

  const medName = `${dose.medication_name}${dose.dosage ? ` ${dose.dosage}` : ''}`;
  const sentence = (l: ReminderLang) => ({ text: reminderSentence(l, medName, dose.food_rule), tag: REMINDER_LANGS[l].tag });
  const sayIn = (list: ReminderLang[]) => {
    setPlaying(true);
    void speakSequence(list.map(sentence)).then((m) => {
      setMissing(m);
      setPlaying(false);
    });
  };

  const play = () => {
    stopAudio();
    setPlaying(true);
    const sayDetails = () => sayIn(langs);
    if (voice?.audio_base64) {
      const a = new Audio(`data:${voice.mime};base64,${voice.audio_base64}`);
      audioRef.current = a;
      a.onended = () => setTimeout(sayDetails, 400);
      a.onerror = sayDetails;
      a.play().catch(sayDetails);
    } else sayDetails();
  };

  const answer = () => {
    stopRing();
    setAnswered(true);
    play();
  };

  const later = () => {
    const d = dose;
    end();
    if (!test) {
      toast.info(`⏰ ${t('remindLater')} — ${SNOOZE_MINUTES} min`);
      setTimeout(() => ring(d, stage), SNOOZE_MINUTES * 60_000);
    }
  };

  const initial = caller.trim().charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-[60] flex animate-fade-in flex-col items-center justify-between gap-6 overflow-y-auto bg-gradient-to-br from-navy-900 via-navy-700 to-teal-700 px-6 py-10 text-white" role="dialog" aria-modal="true" aria-label={t('incomingCall')}>
      <div className="text-center">
        <p className="text-lg font-semibold uppercase tracking-widest text-navy-100">{test ? `🧪 ${t('testCall')}` : stage > 0 ? `${t('incomingCall')} · ${stage + 1}` : t('incomingCall')}</p>
        <div className={`mx-auto mt-6 flex h-32 w-32 items-center justify-center rounded-full bg-white/15 text-6xl font-extrabold ${answered ? '' : 'animate-pulse'}`} aria-hidden>
          {voice ? initial : '💊'}
        </div>
        <p className="mt-4 text-3xl font-extrabold">{caller}</p>
        {voice && (
          <p className="text-navy-100">
            🎙️ {t('voiceMessage')} · {voice.duration_sec}s{voice.language && isReminderLang(voice.language) ? ` · ${REMINDER_LANGS[voice.language].native}` : ''}
          </p>
        )}
      </div>

      <div className="w-full max-w-md rounded-3xl bg-white/10 p-5 text-center">
        <p className="text-5xl font-extrabold">{timeOf(dose.scheduled_at)}</p>
        <p className="mt-2 flex items-center justify-center gap-2 text-3xl font-bold">
          <Pill className="h-8 w-8" aria-hidden /> {dose.medication_name} {dose.dosage}
        </p>
        {dose.units_per_dose > 1 && <p className="text-2xl">× {dose.units_per_dose}</p>}
        <p className="mt-1 flex items-center justify-center gap-2 text-xl text-navy-100">
          <Utensils className="h-5 w-5" aria-hidden /> {REMINDER_LANGS[primary].food[dose.food_rule]}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2" aria-label="Hear in a language">
          {langs.map((l) => (
            <button key={l} type="button" onClick={() => sayIn([l])} className="rounded-full bg-white/20 px-3 py-1 text-base font-semibold hover:bg-white/30">
              🔊 {REMINDER_LANGS[l].native}
            </button>
          ))}
        </div>
        <p className="mt-2 text-lg text-navy-100">{t('noExtraDose')}</p>
        {answered && (
          <div className="mt-4 space-y-2 text-left" aria-live="polite">
            {langs.map((l) => {
              const silent = missing.includes(REMINDER_LANGS[l].tag);
              return (
                <p key={l} className={`animate-fade-in-up rounded-xl px-3 py-2 text-lg ${silent ? 'bg-warn-50 text-warn-700' : 'bg-white/10'}`}>
                  <span className="mr-2 text-sm font-bold uppercase opacity-80">{REMINDER_LANGS[l].native}</span>
                  {sentence(l).text}
                  {silent && <span className="mt-1 block text-sm font-semibold">🔇 No {REMINDER_LANGS[l].name} voice on this browser — please read, or use Microsoft Edge.</span>}
                </p>
              );
            })}
          </div>
        )}
      </div>

      {!answered ? (
        <div className="flex w-full max-w-md justify-around">
          <button onClick={later} className="flex flex-col items-center gap-2 text-lg font-bold" aria-label={t('remindLater')}>
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-bad-600 shadow-lg">
              <PhoneOff className="h-9 w-9" aria-hidden />
            </span>
            {t('remindLater')}
          </button>
          <button onClick={answer} className="flex flex-col items-center gap-2 text-lg font-bold" aria-label={t('answer')}>
            <span className="flex h-20 w-20 animate-ring-pulse items-center justify-center rounded-full bg-ok-600 shadow-lg">
              <Phone className={`h-9 w-9 ${answered ? '' : 'animate-wiggle'}`} aria-hidden />
            </span>
            {t('answer')}
          </button>
        </div>
      ) : (
        <div className="w-full max-w-md space-y-3">
          <button onClick={play} disabled={playing} className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-white/15 text-xl font-bold disabled:opacity-60">
            <RotateCcw aria-hidden /> {playing ? '🔊 …' : t('playAgain')}
          </button>
          {test ? (
            <button onClick={end} className="min-h-[72px] w-full rounded-2xl bg-white text-2xl font-extrabold text-navy-900">
              ✓ {t('endTest')}
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => confirm(dose, 'taken', 'button')}
                disabled={busyId === dose.id}
                className="min-h-[80px] rounded-2xl bg-ok-600 text-2xl font-extrabold shadow-lg disabled:opacity-60"
              >
                ✓ {t('taken')}
              </button>
              <button onClick={later} className="min-h-[80px] rounded-2xl bg-white/20 text-xl font-bold">
                ⏰ {t('remindLater')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
