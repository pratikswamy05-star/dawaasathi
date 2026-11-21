import { LifeBuoy, Phone, X } from 'lucide-react';
import { useState } from 'react';
import { api, errorText } from '../api/client';
import { useT } from '../i18n';
import { toast } from '../store/toast';
import { Button } from './ui';

/** Always-visible HELP button. Alerts caregiver + ASHA + doctor. Never diagnoses. */
export default function HelpButton({ patientId, caregiverPhone }: { patientId: number | null; caregiverPhone?: string | null }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!patientId) return;
    setSending(true);
    try {
      await api(`/patients/${patientId}/help`, { method: 'POST' });
      setSent(true);
      toast.success(t('helpSent'));
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => {
          setSent(false);
          setOpen(true);
        }}
        className="fixed bottom-24 right-4 z-30 flex min-h-[64px] items-center gap-2 rounded-full bg-bad-600 px-6 text-xl font-extrabold text-white shadow-lg hover:bg-bad-700 md:bottom-6"
      >
        <LifeBuoy aria-hidden /> {t('help')}
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="help-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <h2 id="help-title" className="text-2xl font-bold">
                {t('helpTitle')}
              </h2>
              <button onClick={() => setOpen(false)} aria-label={t('close')} className="rounded p-2 hover:bg-slate-100">
                <X aria-hidden />
              </button>
            </div>
            <p className="mt-3 rounded-xl bg-bad-50 p-4 text-lg font-semibold text-bad-700" role="alert">
              {t('helpEmergency')}
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <a href="tel:108" className="inline-flex min-h-[64px] items-center justify-center gap-2 rounded-xl bg-bad-600 text-xl font-bold text-white">
                <Phone aria-hidden /> {t('call108')}
              </a>
              {caregiverPhone && (
                <a href={`tel:${caregiverPhone}`} className="inline-flex min-h-[60px] items-center justify-center gap-2 rounded-xl border-2 border-navy-800 text-xl font-bold text-navy-800">
                  <Phone aria-hidden /> {t('callCaregiver')}
                </a>
              )}
              {patientId && (
                <Button size="lg" onClick={send} loading={sending} disabled={sent}>
                  {sent ? `✓ ${t('helpSent')}` : t('helpSend')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
