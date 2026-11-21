import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, errorText } from '../api/client';
import { toast } from '../store/toast';
import type { RefillPrediction } from '../types';
import { Button, Field } from './ui';

const schema = z.object({
  prescriptionId: z.coerce.number().int().positive('Choose a medicine'),
  quantity: z.coerce.number().int().min(1, 'At least 1').max(1000, 'At most 1000'),
  note: z.string().trim().max(200),
});
type V = z.infer<typeof schema>;

/** Record tablets received (pharmacy / PHC). Updates stock and refill prediction. */
export default function RefillForm({ refills, onSaved }: { refills: RefillPrediction[]; onSaved: () => void }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<V>({ resolver: zodResolver(schema), defaultValues: { quantity: 30, note: '' } });

  const submit = async (v: V) => {
    try {
      await api(`/prescriptions/${v.prescriptionId}/refills`, { method: 'POST', body: { quantity: v.quantity, note: v.note || undefined } });
      toast.success('Refill recorded');
      reset({ quantity: 30, note: '' });
      onSaved();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="grid gap-3 sm:grid-cols-3">
      <Field label="Medicine" htmlFor="rf-rx" error={errors.prescriptionId?.message}>
        <select id="rf-rx" className="input" defaultValue="" {...register('prescriptionId')}>
          <option value="" disabled>
            Choose
          </option>
          {refills.map((r) => (
            <option key={r.prescriptionId} value={r.prescriptionId}>
              {r.medicationName} ({r.remaining} left)
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tablets received" htmlFor="rf-qty" error={errors.quantity?.message}>
        <input id="rf-qty" type="number" min={1} max={1000} className="input" {...register('quantity')} />
      </Field>
      <Field label="Note (optional)" htmlFor="rf-note" error={errors.note?.message}>
        <input id="rf-note" className="input" placeholder="PHC pharmacy" {...register('note')} />
      </Field>
      <div className="sm:col-span-3">
        <Button type="submit" loading={isSubmitting}>
          Record refill
        </Button>
      </div>
    </form>
  );
}
