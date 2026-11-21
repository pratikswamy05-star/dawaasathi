import { Router } from 'express';
import { json, one, q } from '../db';
import { addDays, atLocal, localDate } from '../domain/time';
import { ah, HttpError, idParam, parse } from '../http';
import { requireRole } from '../middleware/auth';
import { accessiblePatientIds, assertPatientAccess, staffProfileId } from '../services/access';
import { createAlert } from '../services/alerts';
import { audit } from '../services/audit';
import { DOSE_SELECT, dosesForDay, patientName } from '../services/doses';
import {
  adherence,
  dailySeries,
  openAlertCount,
  patientOverview,
  patientRow,
  patientSummary,
  refillPredictions,
  riskFor,
  today,
} from '../services/overview';
import { activePrescriptions, createPrescription, patientConflicts, RX_SELECT } from '../services/prescriptions';
import { patientCreateSchema, patientUpdateSchema, prescriptionSchema } from '../validation';

export const patientsRouter = Router();

/** Scoped list with summary columns (risk, adherence, refill). */
patientsRouter.get(
  '/',
  ah(async (req, res) => {
    const ids = await accessiblePatientIds(req.user!);
    res.json({ patients: await Promise.all(ids.map(patientSummary)) });
  }),
);

patientsRouter.post(
  '/',
  requireRole('asha', 'doctor', 'admin'),
  ah(async (req, res) => {
    const b = parse(patientCreateSchema, req.body);
    const mine = await staffProfileId(req.user!);
    const ashaId = req.user!.role === 'asha' ? mine : (b.ashaId ?? null);
    const doctorId = req.user!.role === 'doctor' ? mine : (b.doctorId ?? null);
    const row = await one(
      `insert into patients (name, age, gender, village, phone, conditions, caregiver_id, asha_id, doctor_id)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9) returning id`,
      [b.name, b.age, b.gender, b.village, b.phone || null, json(b.conditions), b.caregiverId ?? null, ashaId, doctorId],
    );
    await audit(req, 'patient_create', 'patient', row!.id);
    res.status(201).json({ patient: await patientRow(Number(row!.id)) });
  }),
);

patientsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    await assertPatientAccess(req.user!, id);
    await audit(req, 'patient_view', 'patient', id);
    res.json(await patientOverview(id));
  }),
);

patientsRouter.patch(
  '/:id',
  requireRole('asha', 'doctor', 'admin'),
  ah(async (req, res) => {
    const id = idParam(req);
    await assertPatientAccess(req.user!, id);
    const b = parse(patientUpdateSchema, req.body);
    // Only admins may re-assign staff; ASHA/doctors may link a caregiver.
    if (req.user!.role !== 'admin' && (b.ashaId !== undefined || b.doctorId !== undefined))
      throw new HttpError(403, 'Only an administrator can change ASHA/doctor assignment');
    const cols: Record<string, unknown> = {
      name: b.name,
      age: b.age,
      gender: b.gender,
      village: b.village,
      phone: b.phone === '' ? null : b.phone,
      caregiver_id: b.caregiverId,
      asha_id: b.ashaId,
      doctor_id: b.doctorId,
    };
    const sets: string[] = [];
    const vals: unknown[] = [id];
    for (const [k, v] of Object.entries(cols)) {
      if (v === undefined) continue;
      vals.push(v);
      sets.push(`${k} = $${vals.length}`);
    }
    if (b.conditions) {
      vals.push(json(b.conditions));
      sets.push(`conditions = $${vals.length}::jsonb`);
    }
    if (sets.length) await q(`update patients set ${sets.join(', ')}, updated_at = now() where id = $1`, vals);
    await audit(req, 'patient_update', 'patient', id, { fields: Object.keys(b) });
    res.json({ patient: await patientRow(id) });
  }),
);

patientsRouter.get(
  '/:id/doses',
  ah(async (req, res) => {
    const id = idParam(req);
    await assertPatientAccess(req.user!, id);
    const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : today();
    res.json({ date, doses: await dosesForDay(id, date) });
  }),
);

patientsRouter.get(
  '/:id/history',
  ah(async (req, res) => {
    const id = idParam(req);
    await assertPatientAccess(req.user!, id);
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
    const from = atLocal(addDays(today(), -(days - 1)), '00:00').toISOString();
    const logs = await q(`${DOSE_SELECT} where d.patient_id = $1 and d.scheduled_at >= $2 and d.status <> 'pending' order by d.scheduled_at desc limit 300`, [
      id,
      from,
    ]);
    res.json({ days, series: await dailySeries(id, days), adherence: await adherence(id, days), logs });
  }),
);

patientsRouter.get(
  '/:id/prescriptions',
  ah(async (req, res) => {
    const id = idParam(req);
    await assertPatientAccess(req.user!, id);
    const all = req.query.all === 'true';
    const rows = all
      ? await q(`${RX_SELECT} where p.patient_id = $1 order by p.status, p.id desc`, [id])
      : await activePrescriptions(id);
    res.json({ prescriptions: rows, conflicts: await patientConflicts(id) });
  }),
);

patientsRouter.post(
  '/:id/prescriptions',
  requireRole('doctor', 'asha', 'admin'),
  ah(async (req, res) => {
    const id = idParam(req);
    await assertPatientAccess(req.user!, id);
    const b = parse(prescriptionSchema, req.body);
    if (!(await one('select 1 from medications where id = $1', [b.medicationId]))) throw new HttpError(400, 'Unknown medicine');
    const doctorId = req.user!.role === 'doctor' ? await staffProfileId(req.user!) : null;
    const rxId = await createPrescription(
      id,
      { ...b, endDate: b.endDate || null, frequency: b.frequency ?? null, doctorId },
      req.user!.id,
    );
    await audit(req, 'prescription_create', 'prescription', rxId, { patientId: id, medicationId: b.medicationId });
    res.status(201).json({ prescriptionId: rxId, conflicts: await patientConflicts(id) });
  }),
);

patientsRouter.get(
  '/:id/conflicts',
  ah(async (req, res) => {
    const id = idParam(req);
    await assertPatientAccess(req.user!, id);
    res.json({ conflicts: await patientConflicts(id) });
  }),
);

patientsRouter.get(
  '/:id/refills',
  ah(async (req, res) => {
    const id = idParam(req);
    await assertPatientAccess(req.user!, id);
    const history = await q(
      `select r.id, r.quantity_added, r.note, r.refilled_at, m.name as medication_name, u.name as recorded_by_name
       from refills r join prescriptions p on p.id = r.prescription_id join medications m on m.id = p.medication_id
       left join users u on u.id = r.recorded_by
       where r.patient_id = $1 order by r.refilled_at desc limit 50`,
      [id],
    );
    res.json({ predictions: await refillPredictions(id), history });
  }),
);

patientsRouter.get(
  '/:id/risk',
  ah(async (req, res) => {
    const id = idParam(req);
    await assertPatientAccess(req.user!, id);
    const history = await q('select score, level, computed_at from patient_risk_scores where patient_id = $1 order by computed_at desc limit 30', [id]);
    res.json({ risk: await riskFor(id), history });
  }),
);

/** Doctor follow-up report: everything needed to review before a clinical decision. */
patientsRouter.get(
  '/:id/report',
  requireRole('doctor', 'asha', 'admin'),
  ah(async (req, res) => {
    const id = idParam(req);
    await assertPatientAccess(req.user!, id);
    const [patient, adh30, adh7, refills, conflicts, risk, series] = await Promise.all([
      patientRow(id),
      adherence(id, 30),
      adherence(id, 7),
      refillPredictions(id),
      patientConflicts(id),
      riskFor(id),
      dailySeries(id, 30),
    ]);
    const missedHistory = await q(
      `${DOSE_SELECT} where d.patient_id = $1 and d.status = 'missed' and d.scheduled_at >= $2 order by d.scheduled_at desc limit 50`,
      [id, atLocal(addDays(today(), -29), '00:00').toISOString()],
    );
    const refillHistory = await q(
      `select r.quantity_added, r.refilled_at, m.name as medication_name from refills r
       join prescriptions p on p.id = r.prescription_id join medications m on m.id = p.medication_id
       where r.patient_id = $1 order by r.refilled_at desc limit 20`,
      [id],
    );
    const recentAlerts = await q(
      `select type, severity, message, status, created_at from alerts where patient_id = $1 order by created_at desc limit 10`,
      [id],
    );
    await audit(req, 'report_view', 'patient', id);
    res.json({
      generatedAt: new Date().toISOString(),
      patient,
      adherence30d: adh30,
      adherence7d: adh7,
      series,
      missedHistory,
      refillGaps: refills.filter((r) => r.status !== 'safe'),
      refills,
      refillHistory,
      conflicts,
      risk,
      recentAlerts,
      openAlerts: await openAlertCount(id),
      note: 'For clinical review only. This report does not diagnose or recommend dose changes.',
    });
  }),
);

/** Patient / caregiver HELP button. Alerts everyone; never diagnoses. */
patientsRouter.post(
  '/:id/help',
  requireRole('patient', 'caregiver'),
  ah(async (req, res) => {
    const id = idParam(req);
    await assertPatientAccess(req.user!, id);
    const name = await patientName(id);
    const stamp = localDate(new Date());
    for (const role of ['caregiver', 'asha', 'doctor'] as const) {
      await createAlert({
        patientId: id,
        type: 'help',
        severity: 'high',
        targetRole: role,
        message: `${name} pressed the HELP button. Please contact them now.`,
        dedupeKey: `help-${id}-${stamp}-${Date.now()}-${role}`,
      });
    }
    await audit(req, 'help_pressed', 'patient', id);
    res.json({
      ok: true,
      message: 'Help request sent to your caregiver, ASHA worker and doctor.',
      emergency: 'For serious symptoms, seek immediate medical attention or call 108.',
    });
  }),
);

