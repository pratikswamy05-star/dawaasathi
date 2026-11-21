import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { api, ApiError, errorText } from '../../api/client';
import { HOME } from '../../components/ProtectedRoute';
import { Button, Field } from '../../components/ui';
import { useT } from '../../i18n';
import { AuthBackground } from './Login';
import { useAuth } from '../../store/auth';
import { toast } from '../../store/toast';
import type { User } from '../../types';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short').max(80),
    phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number'),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Za-z]/, 'Include a letter')
      .regex(/\d/, 'Include a number'),
    confirm: z.string(),
    role: z.enum(['patient', 'caregiver']),
    age: z.string().regex(/^$|^\d{2,3}$/, 'Enter age in years'),
    village: z.string().trim().max(80),
    relation: z.string().trim().max(40),
    bp: z.boolean(),
    diabetes: z.boolean(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });
type V = z.infer<typeof schema>;

/** Self-registration for patients and caregivers. Staff accounts are created by an administrator. */
export default function Register() {
  const { t, lang } = useT();
  const login = useAuth((s) => s.login);
  const nav = useNavigate();
  const [params] = useSearchParams();
  const initialRole = params.get('role') === 'caregiver' ? 'caregiver' : 'patient';
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<V>({ resolver: zodResolver(schema), defaultValues: { role: initialRole, age: '', village: '', relation: '', bp: false, diabetes: false } });
  const role = watch('role');

  const submit = async (v: V) => {
    try {
      const body = {
        name: v.name,
        phone: v.phone,
        password: v.password,
        role: v.role,
        language: lang,
        ...(v.role === 'patient'
          ? { age: v.age ? Number(v.age) : undefined, village: v.village || undefined, conditions: [...(v.bp ? ['BP'] : []), ...(v.diabetes ? ['Diabetes'] : [])] }
          : { relation: v.relation || undefined }),
      };
      const r = await api<{ token: string; user: User }>('/auth/register', { method: 'POST', body });
      login(r.token, r.user);
      toast.success('Account created');
      nav(HOME[r.user.role], { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.details) for (const [k, m] of Object.entries(e.details)) if (m?.[0]) setError(k as keyof V, { message: m[0] });
      toast.error(errorText(e));
    }
  };

  return (
    <AuthBackground>
      <form onSubmit={handleSubmit(submit)} noValidate className="card w-full max-w-lg animate-scale-in space-y-4">
        <h1 className="gradient-text text-3xl font-black">{t('register')}</h1>
        <fieldset>
          <legend className="label">I am a</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['patient', 'caregiver'] as const).map((r) => (
              <label key={r} className={`flex min-h-[52px] cursor-pointer items-center justify-center rounded-xl border-2 font-bold ${role === r ? 'border-navy-800 bg-navy-50' : 'border-slate-300'}`}>
                <input type="radio" value={r} className="sr-only" {...register('role')} />
                {r === 'patient' ? 'Patient' : 'Caregiver'}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Full name" htmlFor="name" error={errors.name?.message}>
          <input id="name" className="input" {...register('name')} />
        </Field>
        <Field label={t('phone')} htmlFor="phone" error={errors.phone?.message}>
          <input id="phone" className="input" inputMode="numeric" maxLength={10} {...register('phone')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('password')} htmlFor="password" error={errors.password?.message}>
            <input id="password" type="password" className="input" autoComplete="new-password" {...register('password')} />
          </Field>
          <Field label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}>
            <input id="confirm" type="password" className="input" autoComplete="new-password" {...register('confirm')} />
          </Field>
        </div>
        {role === 'patient' ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Age" htmlFor="age" error={errors.age?.message}>
                <input id="age" className="input" inputMode="numeric" maxLength={3} {...register('age')} />
              </Field>
              <Field label="Village" htmlFor="village" error={errors.village?.message}>
                <input id="village" className="input" {...register('village')} />
              </Field>
            </div>
            <fieldset>
              <legend className="label">Conditions</legend>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-6 w-6" {...register('bp')} /> BP
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-6 w-6" {...register('diabetes')} /> Diabetes
                </label>
              </div>
            </fieldset>
          </>
        ) : (
          <Field label="Relation to patient (e.g. Son)" htmlFor="relation" error={errors.relation?.message}>
            <input id="relation" className="input" {...register('relation')} />
          </Field>
        )}
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {t('register')}
        </Button>
        <p className="text-center text-sm text-slate-600">
          Doctors, ASHA workers and admins: accounts are created by your administrator.{' '}
          <Link to={`/login/${role}`} className="font-semibold text-navy-600 underline">
            {t('login')}
          </Link>
        </p>
      </form>
    </AuthBackground>
  );
}
