/**
 * Role-based access to patient data. EVERY patient-scoped route goes through here.
 *   patient   -> only their own record
 *   caregiver -> patients linked to them
 *   asha      -> patients assigned to them
 *   doctor    -> patients assigned to them
 *   admin     -> everyone
 */
import { one, q } from '../db';
import { HttpError } from '../http';

export type Role = 'patient' | 'caregiver' | 'asha' | 'doctor' | 'admin';

export interface AuthUser {
  id: number;
  role: Role;
  name: string;
}

const SCOPE_SQL: Record<Exclude<Role, 'admin'>, string> = {
  patient: 'select id from patients where user_id = $1',
  caregiver: 'select p.id from patients p join caregivers c on c.id = p.caregiver_id where c.user_id = $1',
  asha: 'select p.id from patients p join asha_workers a on a.id = p.asha_id where a.user_id = $1',
  doctor: 'select p.id from patients p join doctors d on d.id = p.doctor_id where d.user_id = $1',
};

export async function accessiblePatientIds(user: AuthUser): Promise<number[]> {
  const rows = user.role === 'admin' ? await q('select id from patients order by id') : await q(SCOPE_SQL[user.role], [user.id]);
  return rows.map((r) => Number(r.id));
}

export async function assertPatientAccess(user: AuthUser, patientId: number) {
  const ids = await accessiblePatientIds(user);
  if (!ids.includes(patientId)) throw new HttpError(403, 'You do not have access to this patient');
}

/** Staff profile ids (doctors.id / asha_workers.id / caregivers.id) for the logged-in user. */
export async function staffProfileId(user: AuthUser): Promise<number | null> {
  const table = user.role === 'doctor' ? 'doctors' : user.role === 'asha' ? 'asha_workers' : user.role === 'caregiver' ? 'caregivers' : null;
  if (!table) return null;
  const r = await one(`select id from ${table} where user_id = $1`, [user.id]);
  return r ? Number(r.id) : null;
}

/** User ids that should be notified about a patient, by role. */
export async function recipientUserIds(patientId: number, role: 'caregiver' | 'asha' | 'doctor' | 'patient'): Promise<number[]> {
  const sql = {
    patient: 'select user_id as uid from patients where id = $1 and user_id is not null',
    caregiver: 'select c.user_id as uid from patients p join caregivers c on c.id = p.caregiver_id where p.id = $1',
    asha: 'select a.user_id as uid from patients p join asha_workers a on a.id = p.asha_id where p.id = $1',
    doctor: 'select d.user_id as uid from patients p join doctors d on d.id = p.doctor_id where p.id = $1',
  }[role];
  return (await q(sql, [patientId])).map((r) => Number(r.uid));
}
