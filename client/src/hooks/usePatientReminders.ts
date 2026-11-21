import { useEffect, useRef } from 'react';
import { translate } from '../i18n';
import { showNotification, vibrate } from '../lib/speech';
import { useAuth } from '../store/auth';
import { useReminderCall } from '../store/reminderCall';
import { toast } from '../store/toast';
import type { Dose } from '../types';
import { useApi } from './useApi';

const STAGES = [0, 10, 20]; // minutes after due: reminder, first reminder, second reminder (mirrors server defaults)
const KEY = 'dawaasathi-announced';

function announced(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

/**
 * Voice reminder CALLS + visual + vibration reminders for the logged-in patient.
 * Works OFFLINE too: it uses the cached schedule and the device clock.
 * Also reacts when the server escalates (reminder_count goes up).
 */
export function usePatientReminders(patientId: number | null) {
  const { data } = useApi<{ doses: Dose[] }>(patientId ? `/patients/${patientId}/doses` : null, {
    poll: 30_000,
    cacheKey: patientId ? `doses-${patientId}` : undefined,
  });
  const dosesRef = useRef<Dose[]>([]);
  dosesRef.current = data?.doses ?? [];

  useEffect(() => {
    if (!patientId) return;
    const check = () => {
      const lang = useAuth.getState().lang;
      const done = announced();
      for (const d of dosesRef.current) {
        if (d.status !== 'pending') continue;
        const late = (Date.now() - new Date(d.scheduled_at).getTime()) / 60000;
        // Only ring for doses that are actually due: from their time up to 90 minutes after. Never for later doses.
        if (late < 0 || late > 90) continue;
        const serverStage = d.reminder_count > 0 ? d.reminder_count - 1 : 0;
        const localStage = STAGES.filter((s) => late >= s).length - 1;
        const stage = Math.max(serverStage, localStage);
        const key = `${d.id}-${stage}`;
        if (done.has(key)) continue;
        done.add(key);
        sessionStorage.setItem(KEY, JSON.stringify([...done].slice(-200)));
        const name = `${d.medication_name}${d.dosage ? ` ${d.dosage}` : ''}`;
        const text = translate(lang, 'reminderSpeech', { name, food: translate(lang, d.food_rule) });
        // Ring like a phone call: the call screen plays the recorded voice message, then reads the details aloud.
        useReminderCall.getState().ring(d, stage);
        vibrate();
        toast.info(text);
        void showNotification(translate(lang, 'nextMedicine'), text);
        break; // one reminder at a time
      }
    };
    check();
    const id = setInterval(check, 20_000);
    return () => clearInterval(id);
  }, [patientId, data]);
}
