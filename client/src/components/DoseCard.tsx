import { CheckCircle2, Clock, Mic, Moon, Pill, Utensils, Volume2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../i18n';
import { timeOf } from '../lib/format';
import { listenForConfirmation, speak, voiceInputSupported } from '../lib/speech';
import { toast } from '../store/toast';
import type { Dose } from '../types';
import { Button } from './ui';

export function FoodIcon({ rule }: { rule: Dose['food_rule'] }) {
  if (rule === 'none') return <Moon className="h-6 w-6" aria-hidden />;
  return <Utensils className="h-6 w-6" aria-hidden />;
}

export function DoseStatusBadge({ dose }: { dose: Dose }) {
  const { t } = useT();
  const due = new Date(dose.scheduled_at).getTime() <= Date.now();
  if (dose.status === 'taken')
    return (
      <span className="inline-flex items-center gap-1 text-lg font-bold text-ok-700">
        <CheckCircle2 aria-hidden /> {t('statusTaken')}
      </span>
    );
  if (dose.status === 'missed')
    return (
      <span className="inline-flex items-center gap-1 text-lg font-bold text-bad-700">
        <XCircle aria-hidden /> {t('statusMissed')}
      </span>
    );
  return (
    <span className={`inline-flex items-center gap-1 text-lg font-bold ${due ? 'text-warn-700' : 'text-slate-500'}`}>
      <Clock aria-hidden /> {due ? t('statusPending') : t('statusUpcoming')}
    </span>
  );
}

interface Props {
  dose: Dose;
  big?: boolean;
  busy?: boolean;
  onConfirm?: (status: 'taken' | 'missed', method: 'button' | 'voice') => void;
}

/** Large, elder-friendly dose card: time, medicine, food rule, hear, TAKEN / MISSED, voice confirm. */
export default function DoseCard({ dose, big, busy, onConfirm }: Props) {
  const { t, lang } = useT();
  const [listening, setListening] = useState(false);
  const food = t(dose.food_rule);
  const spoken = t('reminderSpeech', { name: `${dose.medication_name}${dose.dosage ? ` ${dose.dosage}` : ''}`, food });

  const voice = async () => {
    setListening(true);
    const r = await listenForConfirmation(lang);
    setListening(false);
    if (r) onConfirm?.(r, 'voice');
    else toast.info(t('didNotHear'));
  };

  const border = dose.status === 'taken' ? 'border-l-ok-600' : dose.status === 'missed' ? 'border-l-bad-600' : 'border-l-warn-600';

  return (
    <article className={`card border-l-8 ${border} ${big ? 'p-6' : ''}`} aria-label={`${dose.medication_name}, ${timeOf(dose.scheduled_at)}, ${food}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={`${big ? 'text-4xl' : 'text-2xl'} font-extrabold text-navy-900`}>{timeOf(dose.scheduled_at)}</p>
          <p className={`${big ? 'text-3xl' : 'text-2xl'} mt-1 flex items-center gap-2 font-bold`}>
            <Pill className="h-7 w-7 text-navy-600" aria-hidden />
            {dose.medication_name}
            {dose.dosage && <span className="font-semibold text-slate-600">{dose.dosage}</span>}
            {dose.units_per_dose > 1 && <span className="text-slate-600">× {dose.units_per_dose}</span>}
          </p>
          <p className="mt-1 flex items-center gap-2 text-xl text-slate-700">
            <FoodIcon rule={dose.food_rule} /> {food}
          </p>
          {(dose.instructions || dose.medication_instructions) && (
            <p className="mt-2 text-lg text-slate-600">{dose.instructions || dose.medication_instructions}</p>
          )}
        </div>
        <DoseStatusBadge dose={dose} />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <Button variant="secondary" size={big ? 'lg' : 'md'} onClick={() => speak(spoken, lang)}>
          <Volume2 aria-hidden /> {t('hearReminder')}
        </Button>
        {onConfirm && dose.status !== 'taken' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="success" size={big ? 'xl' : 'lg'} loading={busy} onClick={() => onConfirm('taken', 'button')}>
                ✓ {t('taken')}
              </Button>
              {dose.status === 'pending' && (
                <Button variant="danger" size={big ? 'xl' : 'lg'} disabled={busy} onClick={() => onConfirm('missed', 'button')}>
                  ✕ {t('missed')}
                </Button>
              )}
            </div>
            {voiceInputSupported() && (
              <Button variant="ghost" onClick={voice} disabled={listening || busy}>
                <Mic aria-hidden /> {listening ? t('listening') : t('sayIt')}
              </Button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
