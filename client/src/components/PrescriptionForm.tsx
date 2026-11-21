import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, ApiError, errorText } from '../api/client';
import { useApi } from '../hooks/useApi';
import { toast } from '../store/toast';
import type { Conflict, Medication } from '../types';
import { ConflictList } from './Insights';
import { Button, Field } from './ui';

const today = () => new Date().toLocaleDateString('en-CA');

const schema = z
  .object({
    medicationId: z.coerce.number().int().positive('Choose a medicine'),
    prescriberName: z.string().trim().min(2, 'Who prescribed it?').max(80),
    source: z.enum(['PHC', 'Health camp', 'Private', 'Hospital']),
    dosage: z
      .string()
      .trim()
      .max(20)
      .regex(/^$|^\d+(\.\d+)?\s?(mg|mcg|g|ml|iu|units?)$/i, 'Write dosage like 500mg'),
    unitsPerDose: z.coerce.number().int().min(1).max(10),
    frequency: z.enum(['', 'OD', 'BD', 'TDS', 'QID', 'HS']),
    times: z
      .string()
      .trim()
      .regex(/^$|^(([01]\d|2[0-3]):[0-5]\d)(\s*,\s*([01]\d|2[0-3]):[0-5]\d)*$/, 'Use 24-hour times like 08:00, 20:00'),
    foodRule: z.enum(['before', 'after', 'with', 'none']),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
    endDate: z.string(),
    currentQuantity: z.coerce.number().int().min(0, '0 or more').max(1000),
    instructions: z.string().trim().max(300),
  })
  .refine((v) => v.frequency || v.times, { message: 'Choose how often, or enter exact times', path: ['frequency'] })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: 'End date must be after start date', path: ['endDate'] });

type FormValues = z.infer<typeof schema>;

const toPayload = (v: FormValues) => ({
  medicationId: v.medicationId,
  prescriberName: v.prescriberName,
  source: v.source,
  dosage: v.dosage || null,
  unitsPerDose: v.unitsPerDose,
  frequency: v.frequency || null,
  times: v.times ? v.times.split(',').map((s) => s.trim()) : [],
  foodRule: v.foodRule,
  startDate: v.startDate,
  endDate: v.endDate || null,
  currentQuantity: v.currentQuantity,
  instructions: v.instructions || null,
});

/**
 * Add a prescription. Step 1 checks for conflicts (nothing saved). If warnings appear, the user must
 * explicitly confirm they will verify with the doctor/pharmacist. The system never changes doses itself.
 */
export default function PrescriptionForm({ patientId, defaultPrescriber, onSaved }: { patientId: number; defaultPrescriber?: string; onSaved: () => void }) {
  const meds = useApi<{ medications: Medication[] }>('/medications');
  const [warnings, setWarnings] = useState<Conflict[] | null>(null);
  const [saving, setSaving] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      prescriberName: defaultPrescriber ?? '',
      source: 'PHC',
      dosage: '',
      unitsPerDose: 1,
      frequency: 'OD',
      times: '',
      foodRule: 'after',
      startDate: today(),
      endDate: '',
      currentQuantity: 30,
      instructions: '',
    },
  });

  const serverErrors = (e: unknown) => {
    if (e instanceof ApiError && e.details) {
      for (const [k, msgs] of Object.entries(e.details)) if (msgs?.[0]) setError(k as keyof FormValues, { message: msgs[0] });
    }
    toast.error(errorText(e));
  };

  const save = async (v: FormValues) => {
    setSaving(true);
    try {
      await api(`/patients/${patientId}/prescriptions`, { method: 'POST', body: toPayload(v) });
      toast.success('Prescription saved and schedule updated');
      setWarnings(null);
      reset();
      onSaved();
    } catch (e) {
      serverErrors(e);
    } finally {
      setSaving(false);
    }
  };

  const check = async (v: FormValues) => {
    if (warnings) return save(v); // second click = "save anyway, I will verify"
    setSaving(true);
    try {
      const r = await api<{ conflicts: Conflict[] }>('/prescriptions/check', { method: 'POST', body: { patientId, draft: toPayload(v) } });
      if (r.conflicts.length) setWarnings(r.conflicts);
      else await save(v);
    } catch (e) {
      serverErrors(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(check)} noValidate className="grid gap-4 md:grid-cols-2" onChange={() => warnings && setWarnings(null)}>
      <Field label="Medicine" htmlFor="rx-med" error={errors.medicationId?.message}>
        <select id="rx-med" className="input" {...register('medicationId')} defaultValue="">
          <option value="" disabled>
            {meds.loading ? 'Loading…' : 'Choose medicine'}
          </option>
          {meds.data?.medications.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.category}) — {m.active_ingredients.join(' + ')}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Dosage (e.g. 500mg)" htmlFor="rx-dosage" error={errors.dosage?.message}>
        <input id="rx-dosage" className="input" {...register('dosage')} />
      </Field>
      <Field label="Tablets per dose" htmlFor="rx-units" error={errors.unitsPerDose?.message}>
        <input id="rx-units" type="number" min={1} max={10} className="input" {...register('unitsPerDose')} />
      </Field>
      <Field label="How often" htmlFor="rx-freq" error={errors.frequency?.message}>
        <select id="rx-freq" className="input" {...register('frequency')}>
          <option value="OD">Once a day (OD)</option>
          <option value="BD">Twice a day (BD)</option>
          <option value="TDS">Three times a day (TDS)</option>
          <option value="QID">Four times a day (QID)</option>
          <option value="HS">At bedtime (HS)</option>
          <option value="">Use exact times below</option>
        </select>
      </Field>
      <Field label="Exact times (optional, 24-hour, comma separated)" htmlFor="rx-times" error={errors.times?.message}>
        <input id="rx-times" className="input" placeholder="08:00, 20:00" {...register('times')} />
      </Field>
      <Field label="Food" htmlFor="rx-food" error={errors.foodRule?.message}>
        <select id="rx-food" className="input" {...register('foodRule')}>
          <option value="before">Before food</option>
          <option value="after">After food</option>
          <option value="with">With food</option>
          <option value="none">Any time / not related to food</option>
        </select>
      </Field>
      <Field label="Prescribed by" htmlFor="rx-by" error={errors.prescriberName?.message}>
        <input id="rx-by" className="input" {...register('prescriberName')} />
      </Field>
      <Field label="Source" htmlFor="rx-src" error={errors.source?.message}>
        <select id="rx-src" className="input" {...register('source')}>
          <option>PHC</option>
          <option>Health camp</option>
          <option>Private</option>
          <option>Hospital</option>
        </select>
      </Field>
      <Field label="Start date" htmlFor="rx-start" error={errors.startDate?.message}>
        <input id="rx-start" type="date" className="input" {...register('startDate')} />
      </Field>
      <Field label="End date (optional)" htmlFor="rx-end" error={errors.endDate?.message}>
        <input id="rx-end" type="date" className="input" {...register('endDate')} />
      </Field>
      <Field label="Tablets in hand now" htmlFor="rx-qty" error={errors.currentQuantity?.message}>
        <input id="rx-qty" type="number" min={0} max={1000} className="input" {...register('currentQuantity')} />
      </Field>
      <Field label="Instructions for the patient (optional)" htmlFor="rx-ins" error={errors.instructions?.message}>
        <input id="rx-ins" className="input" {...register('instructions')} />
      </Field>

      {warnings && (
        <div className="md:col-span-2 space-y-3 rounded-xl border border-warn-600/40 bg-warn-50 p-4" role="alert">
          <p className="flex items-center gap-2 font-bold text-warn-700">
            <AlertTriangle aria-hidden /> Possible issues found. Please verify with the doctor/pharmacist before saving.
          </p>
          <ConflictList conflicts={warnings} />
        </div>
      )}

      <div className="md:col-span-2 flex flex-wrap gap-3">
        <Button type="submit" loading={saving} variant={warnings ? 'danger' : 'primary'}>
          {warnings ? 'I will verify — save anyway' : 'Check & save prescription'}
        </Button>
        {warnings && (
          <Button type="button" variant="secondary" onClick={() => setWarnings(null)}>
            Go back and edit
          </Button>
        )}
      </div>
    </form>
  );
}
