import { zodResolver } from '@hookform/resolvers/zod';
import { Activity, Bell, Users } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, ApiError, errorText } from '../../api/client';
import { DoseBars } from '../../components/Insights';
import { Badge, Button, Card, ErrorState, Field, PageHeader, Spinner, StatCard } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { dateTimeOf } from '../../lib/format';
import { toast } from '../../store/toast';
import type { SeriesPoint } from '../../types';

interface AdminDash {
  users: { role: string; n: number; active: number }[];
  patients: number;
  dosesToday: { status: string; n: number }[];
  openAlerts: { type: string; n: number }[];
  series: SeriesPoint[];
  audit: { id: number; action: string; entity: string | null; entity_id: string | null; created_at: string; user_name: string | null; user_role: string | null }[];
}

export function AdminDashboard() {
  const { data, loading, error, reload } = useApi<AdminDash>('/dashboard/admin', { poll: 60_000 });
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;
  const total = data.users.reduce((s, u) => s + u.n, 0);
  const dose = (s: string) => data.dosesToday.find((d) => d.status === s)?.n ?? 0;
  const alerts = data.openAlerts.reduce((s, a) => s + a.n, 0);
  return (
    <div className="space-y-6">
      <PageHeader title="System overview" />
      <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Users" value={total} icon={<Users aria-hidden />} />
        <StatCard label="Patients" value={data.patients} icon={<Users aria-hidden />} />
        <StatCard label="Doses today (taken / missed / due)" value={`${dose('taken')} / ${dose('missed')} / ${dose('pending')}`} tone="green" icon={<Activity aria-hidden />} />
        <StatCard label="Open alerts" value={alerts} tone="red" icon={<Bell aria-hidden />} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Doses — all patients, last 14 days">
          <DoseBars series={data.series} />
        </Card>
        <Card title="Users by role">
          <ul className="divide-y">
            {data.users.map((u) => (
              <li key={u.role} className="flex justify-between py-2">
                <span className="font-semibold capitalize">{u.role}</span>
                <span>
                  {u.active} active / {u.n}
                </span>
              </li>
            ))}
          </ul>
          <h3 className="mt-4 font-bold">Open alerts by type</h3>
          <ul className="mt-1 flex flex-wrap gap-2">
            {data.openAlerts.map((a) => (
              <Badge key={a.type} tone="amber">
                {a.type}: {a.n}
              </Badge>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="Audit log (latest)">
        <AuditTable rows={data.audit} />
      </Card>
    </div>
  );
}

function AuditTable({ rows }: { rows: AdminDash['audit'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-50">
          <tr>
            <th className="table-th">Time</th>
            <th className="table-th">User</th>
            <th className="table-th">Action</th>
            <th className="table-th">Entity</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="table-td whitespace-nowrap">{dateTimeOf(r.created_at)}</td>
              <td className="table-td">
                {r.user_name ?? 'system'} {r.user_role && <span className="text-sm text-slate-500">({r.user_role})</span>}
              </td>
              <td className="table-td font-mono text-sm">{r.action}</td>
              <td className="table-td text-sm">
                {r.entity ?? ''} {r.entity_id ?? ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface UserRow {
  id: number;
  name: string;
  phone: string;
  role: string;
  language: string;
  active: boolean;
  created_at: string;
  facility: string | null;
  area: string | null;
  relation: string | null;
}

const userSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, '10-digit mobile number'),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Za-z]/, 'Include a letter')
    .regex(/\d/, 'Include a number'),
  role: z.enum(['patient', 'caregiver', 'asha', 'doctor', 'admin']),
  language: z.enum(['en', 'kn', 'hi']),
  extra: z.string().trim().max(80),
});
type UserForm = z.infer<typeof userSchema>;

export function AdminUsers() {
  const [role, setRole] = useState('');
  const { data, loading, error, reload } = useApi<{ users: UserRow[] }>(`/admin/users${role ? `?role=${role}` : ''}`);
  const logs = useApi<{ logs: AdminDash['audit'] }>('/admin/audit-logs?limit=50');
  const [adding, setAdding] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UserForm>({ resolver: zodResolver(userSchema), defaultValues: { role: 'asha', language: 'en', extra: '' } });
  const newRole = watch('role');

  const create = async (v: UserForm) => {
    try {
      await api('/admin/users', {
        method: 'POST',
        body: {
          name: v.name,
          phone: v.phone,
          password: v.password,
          role: v.role,
          language: v.language,
          ...(v.role === 'doctor' && v.extra ? { facility: v.extra } : {}),
          ...(v.role === 'asha' && v.extra ? { area: v.extra } : {}),
          ...(v.role === 'caregiver' && v.extra ? { relation: v.extra } : {}),
        },
      });
      toast.success('User created');
      reset();
      setAdding(false);
      void reload();
    } catch (e) {
      if (e instanceof ApiError && e.details) for (const [k, m] of Object.entries(e.details)) if (m?.[0]) setError(k as keyof UserForm, { message: m[0] });
      toast.error(errorText(e));
    }
  };

  const toggle = async (u: UserRow) => {
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } });
      toast.success(u.active ? 'User deactivated' : 'User activated');
      void reload();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="User management"
        subtitle="Create doctors, ASHA workers, caregivers and admins. Deactivated users are logged out immediately."
        action={
          <Button variant={adding ? 'secondary' : 'primary'} onClick={() => setAdding((a) => !a)}>
            {adding ? 'Close' : 'Add user'}
          </Button>
        }
      />
      {adding && (
        <Card title="New user">
          <form onSubmit={handleSubmit(create)} noValidate className="grid gap-4 md:grid-cols-3">
            <Field label="Name" htmlFor="u-name" error={errors.name?.message}>
              <input id="u-name" className="input" {...register('name')} />
            </Field>
            <Field label="Mobile" htmlFor="u-phone" error={errors.phone?.message}>
              <input id="u-phone" className="input" inputMode="numeric" maxLength={10} {...register('phone')} />
            </Field>
            <Field label="Temporary password" htmlFor="u-pw" error={errors.password?.message}>
              <input id="u-pw" type="password" autoComplete="new-password" className="input" {...register('password')} />
            </Field>
            <Field label="Role" htmlFor="u-role" error={errors.role?.message}>
              <select id="u-role" className="input" {...register('role')}>
                <option value="asha">ASHA worker</option>
                <option value="doctor">Doctor</option>
                <option value="caregiver">Caregiver</option>
                <option value="patient">Patient</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <Field label="Language" htmlFor="u-lang">
              <select id="u-lang" className="input" {...register('language')}>
                <option value="en">English</option>
                <option value="kn">Kannada</option>
                <option value="hi">Hindi</option>
              </select>
            </Field>
            {(newRole === 'doctor' || newRole === 'asha' || newRole === 'caregiver') && (
              <Field label={newRole === 'doctor' ? 'Facility' : newRole === 'asha' ? 'Area' : 'Relation'} htmlFor="u-extra" error={errors.extra?.message}>
                <input id="u-extra" className="input" {...register('extra')} />
              </Field>
            )}
            <div className="md:col-span-3">
              <Button type="submit" loading={isSubmitting}>
                Create user
              </Button>
            </div>
          </form>
        </Card>
      )}
      <select className="input max-w-[220px]" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
        <option value="">All roles</option>
        <option value="patient">Patients</option>
        <option value="caregiver">Caregivers</option>
        <option value="asha">ASHA workers</option>
        <option value="doctor">Doctors</option>
        <option value="admin">Admins</option>
      </select>
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-th">Name</th>
                <th className="table-th">Role</th>
                <th className="table-th">Mobile</th>
                <th className="table-th">Details</th>
                <th className="table-th">Status</th>
                <th className="table-th" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {data?.users.map((u) => (
                <tr key={u.id}>
                  <td className="table-td font-semibold">{u.name}</td>
                  <td className="table-td capitalize">{u.role}</td>
                  <td className="table-td">{u.phone}</td>
                  <td className="table-td text-sm text-slate-600">{u.facility ?? u.area ?? u.relation ?? ''}</td>
                  <td className="table-td">
                    <Badge tone={u.active ? 'green' : 'slate'}>{u.active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="table-td">
                    <Button variant="ghost" onClick={() => toggle(u)}>
                      {u.active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Card title="Audit logs">{logs.data ? <AuditTable rows={logs.data.logs} /> : <Spinner />}</Card>
    </div>
  );
}
