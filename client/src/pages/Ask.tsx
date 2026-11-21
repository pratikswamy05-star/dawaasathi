import { useEffect, useState } from 'react';
import ChatPanel from '../components/ChatPanel';
import { Spinner } from '../components/ui';
import { useApi } from '../hooks/useApi';
import { useT } from '../i18n';
import { useAuth } from '../store/auth';
import type { PatientSummary } from '../types';

/** /patient/ask and /caregiver/ask — the patient asks about themself; a caregiver picks a linked patient. */
export default function Ask() {
  const { t } = useT();
  const user = useAuth((s) => s.user!);
  const isPatient = user.role === 'patient';
  const { data, loading } = useApi<{ patients: PatientSummary[] }>(isPatient ? null : '/patients', { cacheKey: 'chat-patients' });
  const [pid, setPid] = useState<number | null>(isPatient ? user.patientId : null);

  useEffect(() => {
    if (!isPatient && pid == null && data?.patients.length) setPid(data.patients[0].id);
  }, [data, isPatient, pid]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-extrabold">{t('askTitle')}</h1>
      {!isPatient &&
        (loading && !data ? (
          <Spinner />
        ) : (
          (data?.patients.length ?? 0) > 1 && (
            <label className="block">
              <span className="label">{t('choosePatient')}</span>
              <select className="input max-w-sm" value={pid ?? ''} onChange={(e) => setPid(Number(e.target.value))}>
                {data!.patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )
        ))}
      {(isPatient || pid) && <ChatPanel key={pid ?? 0} patientId={isPatient ? null : pid} />}
    </div>
  );
}
