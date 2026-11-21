/**
 * Voice reminders ("reminder calls"):
 *  - family / ASHA / doctor record a short voice message for a medicine (or for all medicines)
 *  - they can move the reminder TIMES (never the number of doses)
 *  - at dose time the patient's app rings like a phone call and plays the recording
 */
import { Router } from 'express';
import { one, q } from '../db';
import { validateReminderTimes } from '../domain/reminderTimes';
import { dosesPerDay, scheduleTimes } from '../domain/schedule';
import { ah, HttpError, idParam, parse } from '../http';
import { requireRole } from '../middleware/auth';
import { assertPatientAccess, recipientUserIds } from '../services/access';
import { notifyUsers } from '../services/alerts';
import { audit } from '../services/audit';
import { activePrescriptions, regenerateSchedules } from '../services/prescriptions';
import { reminderLanguagesSchema, reminderTimesSchema, voiceReminderSchema, REMINDER_LANGS } from '../validation';

const MAX_ACTIVE = 12;

const VOICE_SELECT = `
  select v.id, v.patient_id, v.prescription_id, v.language, v.mime, v.duration_sec, v.created_at, v.recorded_by,
         u.name as recorded_by_name, u.role as recorded_by_role, c.relation as recorded_by_relation, m.name as medication_name
  from voice_reminders v
  left join users u on u.id = v.recorded_by
  left join caregivers c on c.user_id = v.recorded_by
  left join prescriptions p on p.id = v.prescription_id
  left join medications m on m.id = p.medication_id`;

const LANG_NAME: Record<string, string> = { en: 'English', kn: 'Kannada', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', mr: 'Marathi' };

/** The patient's chosen reminder languages, falling back to their app language. */
export async function reminderLanguages(patientId: number): Promise<string[]> {
  const r = await one('select p.reminder_languages, u.language from patients p left join users u on u.id = p.user_id where p.id = $1', [patientId]);
  const list = ((r?.reminder_languages ?? []) as string[]).filter((l) => (REMINDER_LANGS as readonly string[]).includes(l));
  return list.length ? list : [r?.language ?? 'en'];
}

/* /api/patients/:id/reminders */
export const remindersRouter = Router({ mergeParams: true });

remindersRouter.get(
  '/',
  ah(async (req, res) => {
    const id = idParam(req);
    await assertPatientAccess(req.user!, id);
    const withAudio = req.query.audio === '1';
    const rxs = await activePrescriptions(id);
    const voices = await q(
      `${VOICE_SELECT.replace('select v.id,', `select v.id,${withAudio ? ' v.audio_base64,' : ''}`)} where v.patient_id = $1 and v.active order by v.created_at desc`,
      [id],
    );
    res.json({
      languages: await reminderLanguages(id),
      prescriptions: rxs.map((rx) => ({
        id: Number(rx.id),
        medication_name: rx.medication_name,
        dosage: rx.dosage,
        food_rule: rx.food_rule,
        frequency: rx.frequency,
        prescriber_name: rx.prescriber_name,
        times: scheduleTimes({ frequency: rx.frequency, foodRule: rx.food_rule, times: rx.times ?? [] }),
        dosesPerDay: dosesPerDay({ frequency: rx.frequency, foodRule: rx.food_rule, times: rx.times ?? [] }),
      })),
      voices,
    });
  }),
);

remindersRouter.post(
  '/voice',
  requireRole('patient', 'caregiver', 'asha', 'doctor', 'admin'),
  ah(async (req, res) => {
    const id = idParam(req);
    await assertPatientAccess(req.user!, id);
    const b = parse(voiceReminderSchema, req.body);
    if (b.prescriptionId) {
      const rx = await one(`select id from prescriptions where id = $1 and patient_id = $2 and status = 'active'`, [b.prescriptionId, id]);
      if (!rx) throw new HttpError(400, 'That medicine is not an active prescription for this patient');
    }
    const language = b.language ?? (await reminderLanguages(id))[0];
    // One recording per medicine (or one general one) per person per language: a new one replaces the old.
    await q(
      `update voice_reminders set active = false where patient_id = $1 and recorded_by = $2 and active and language is not distinct from $3 and ${b.prescriptionId ? 'prescription_id = $4' : 'prescription_id is null'}`,
      b.prescriptionId ? [id, req.user!.id, language, b.prescriptionId] : [id, req.user!.id, language],
    );
    const count = await one('select count(*)::int as n from voice_reminders where patient_id = $1 and active', [id]);
    if (Number(count?.n ?? 0) >= MAX_ACTIVE) throw new HttpError(409, `This patient already has ${MAX_ACTIVE} voice reminders. Delete an old one first.`);
    const row = await one(
      `insert into voice_reminders (patient_id, prescription_id, recorded_by, audio_base64, mime, duration_sec, language) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [id, b.prescriptionId ?? null, req.user!.id, b.audio, b.mime, b.durationSec, language],
    );
    const voiceId = Number(row!.id);
    if (req.user!.role !== 'patient') {
      const med = b.prescriptionId
        ? (await one('select m.name from prescriptions p join medications m on m.id = p.medication_id where p.id = $1', [b.prescriptionId]))?.name
        : null;
      await notifyUsers(await recipientUserIds(id, 'patient'), {
        type: 'voice_reminder',
        title: 'New voice reminder',
        body: `${req.user!.name} recorded a ${LANG_NAME[language] ?? ''} voice reminder${med ? ` for ${med}` : ''}. You will hear it at medicine time.`,
      });
    }
    await audit(req, 'voice_reminder_create', 'patient', id, { voiceId, prescriptionId: b.prescriptionId ?? null, sec: b.durationSec });
    res.status(201).json({ voice: await one(`${VOICE_SELECT} where v.id = $1`, [voiceId]) });
  }),
);

remindersRouter.put(
  '/languages',
  requireRole('patient', 'caregiver', 'asha', 'doctor', 'admin'),
  ah(async (req, res) => {
    const id = idParam(req);
    await assertPatientAccess(req.user!, id);
    const b = parse(reminderLanguagesSchema, req.body);
    const before = await reminderLanguages(id);
    await q('update patients set reminder_languages = $2::jsonb, updated_at = now() where id = $1', [id, JSON.stringify(b.languages)]);
    if (req.user!.role !== 'patient')
      await notifyUsers(await recipientUserIds(id, 'patient'), {
        type: 'reminder_language',
        title: 'Reminder language changed',
        body: `${req.user!.name} set your medicine reminders to: ${b.languages.map((l) => LANG_NAME[l]).join(' → ')}.`,
      });
    await audit(req, 'reminder_languages_update', 'patient', id, { before, after: b.languages });
    res.json({ languages: b.languages, before });
  }),
);

remindersRouter.put(
  '/times/:rxId',
  requireRole('caregiver', 'asha', 'doctor', 'admin'),
  ah(async (req, res) => {
    const id = idParam(req);
    const rxId = idParam(req, 'rxId');
    await assertPatientAccess(req.user!, id);
    const b = parse(reminderTimesSchema, req.body);
    const rx = await one(
      `select p.id, p.frequency, p.food_rule, p.times, p.status, m.name from prescriptions p join medications m on m.id = p.medication_id where p.id = $1 and p.patient_id = $2`,
      [rxId, id],
    );
    if (!rx || rx.status !== 'active') throw new HttpError(404, 'Active prescription not found for this patient');
    const before = scheduleTimes({ frequency: rx.frequency, foodRule: rx.food_rule, times: rx.times ?? [] });
    const v = validateReminderTimes(b.times, before.length);
    if (!v.ok) throw new HttpError(400, v.error);
    await q(`update prescriptions set times = $2::jsonb, updated_at = now() where id = $1`, [rxId, JSON.stringify(v.times)]);
    await regenerateSchedules(rxId);
    const body = `${rx.name} reminder time changed from ${before.join(', ')} to ${v.times.join(', ')} by ${req.user!.name}.`;
    const users = new Set<number>();
    for (const r of ['patient', 'caregiver', 'asha', 'doctor'] as const) for (const u of await recipientUserIds(id, r)) users.add(u);
    users.delete(req.user!.id);
    await notifyUsers([...users], { type: 'reminder_time', title: 'Medicine time changed', body });
    await audit(req, 'reminder_times_update', 'prescription', rxId, { before, after: v.times });
    res.json({ prescriptionId: rxId, times: v.times, before });
  }),
);

/* /api/voice-reminders/:id (delete) */
export const voiceRouter = Router();

voiceRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const v = await one('select id, patient_id, recorded_by from voice_reminders where id = $1 and active', [id]);
    if (!v) throw new HttpError(404, 'Voice reminder not found');
    await assertPatientAccess(req.user!, Number(v.patient_id));
    const role = req.user!.role;
    if (Number(v.recorded_by) !== req.user!.id && !['doctor', 'asha', 'admin'].includes(role))
      throw new HttpError(403, 'Only the person who recorded it, the ASHA worker or the doctor can delete this voice reminder.');
    await q('update voice_reminders set active = false where id = $1', [id]);
    await audit(req, 'voice_reminder_delete', 'patient', Number(v.patient_id), { voiceId: id });
    res.json({ ok: true });
  }),
);
