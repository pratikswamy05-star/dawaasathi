import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { translate } from '../i18n';
import { queueConfirm } from '../lib/offline';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import type { Dose } from '../types';

type Method = 'button' | 'voice' | 'caregiver' | 'asha';

/** Records TAKEN / MISSED. Online → API; offline → IndexedDB queue (optimistic). */
export function useConfirmDose(onChange: (d: Dose) => void) {
  const [busyId, setBusyId] = useState<number | null>(null);

  async function confirm(dose: Dose, status: 'taken' | 'missed', method: Method = 'button') {
    const lang = useAuth.getState().lang;
    setBusyId(dose.id);
    const optimistic: Dose = { ...dose, status, confirmed_at: new Date().toISOString(), method };
    try {
      const r = await api<{ dose: Dose }>(`/doses/${dose.id}/confirm`, { method: 'POST', body: { status, method } });
      onChange(r.dose);
      toast.success(translate(lang, status === 'taken' ? 'markedTaken' : 'markedMissed'));
    } catch (e) {
      if (e instanceof ApiError && e.offline) {
        await queueConfirm({ doseId: dose.id, status, method });
        onChange(optimistic);
        toast.info(translate(lang, 'savedOffline'));
      } else {
        toast.error(e instanceof Error ? e.message : 'Could not save');
      }
    } finally {
      setBusyId(null);
    }
  }

  return { confirm, busyId };
}
