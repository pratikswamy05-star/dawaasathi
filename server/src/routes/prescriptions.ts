import { Router } from 'express';
import { json, one, q } from '../db';
import { detectConflicts } from '../domain/conflicts';
import { ah, HttpError, idParam, parse } from '../http';
import { requireRole } from '../middleware/auth';
import { assertPatientAccess } from '../services/access';
import { audit } from '../services/audit';
import { activePrescriptions, raiseConflictAlerts, regenerateSchedules, toCheck } from '../services/prescriptions';
import { checkSchema, prescriptionSchema, prescriptionUpdateSchema, refillSchema } from '../validation';

export const prescriptionsRouter = Router();

async function loadRx(id: number) {
  const rx = await one('select id, patient_id from prescriptions where id = $1', [id]);
  if (!rx) throw new HttpError(404, 'Prescription not found');
  return { id, patientId: Number(rx.patient_id) };
}

/** Preview conflicts for a draft prescription BEFORE saving (nothing is written). */
prescriptionsRouter.post(
  '/check',
  requireRole('doctor', 'asha', 'admin'),
  ah(async (req, res) => {
    const { patientId, draft } = parse(checkSchema, req.body);
    await assertPatientAccess(req.user!, patientId);
    const d = parse(prescriptionSchema, draft);
    const med = await one('select id, name, active_ingredients from medications where id = $1', [d.medicationId]);
    if (!med) throw new HttpError(400, 'Unknown medicine');
    const existing = (await activePrescriptions(patientId)).map(toCheck);
    const conflicts = detectConflicts([
      ...existing,
      {
        id: 'new',
        medicationId: d.medicationId,
        medicationName: med.name,
        activeIngredients: med.active_ingredients ?? [],
        dosage: d.dosage ?? null,
        frequency: d.frequency ?? null,
        times: d.times,
        foodRule: d.foodRule,
        prescriber: d.prescriberName,
        startDate: d.startDate,
        endDate: d.endDate || null,
      },
    ]).filter((c) => c.prescriptionIds.includes('new'));
    res.json({ conflicts });
  }),
);

prescriptionsRouter.patch(
  '/:id',
  requireRole('doctor', 'asha', 'admin'),
  ah(async (req, res) => {
    const rx = await loadRx(idParam(req));
    await assertPatientAccess(req.user!, rx.patientId);
    const b = parse(prescriptionUpdateSchema, req.body);
    const map: Record<string, [string, unknown]> = {
      dosage: ['dosage', b.dosage],
      unitsPerDose: ['units_per_dose', b.unitsPerDose],
      frequency: ['frequency', b.frequency],
      foodRule: ['food_rule', b.foodRule],
      endDate: ['end_date', b.endDate],
      instructions: ['instructions', b.instructions],
    };
    const sets: string[] = [];
    const vals: unknown[] = [rx.id];
    for (const [, [col, v]] of Object.entries(map)) {
      if (v === undefined) continue;
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    }
    if (b.times) {
      vals.push(json(b.times));
      sets.push(`times = $${vals.length}::jsonb`);
    }
    if (sets.length) await q(`update prescriptions set ${sets.join(', ')}, updated_at = now() where id = $1`, vals);
    await regenerateSchedules(rx.id);
    await raiseConflictAlerts(rx.patientId);
    await audit(req, 'prescription_update', 'prescription', rx.id, { fields: Object.keys(b) });
    res.json({ ok: true });
  }),
);

prescriptionsRouter.post(
  '/:id/stop',
  requireRole('doctor', 'asha', 'admin'),
  ah(async (req, res) => {
    const rx = await loadRx(idParam(req));
    await assertPatientAccess(req.user!, rx.patientId);
    await q(`update prescriptions set status = 'stopped', updated_at = now() where id = $1`, [rx.id]);
    await regenerateSchedules(rx.id);
    await q(`update alerts set status = 'resolved' where prescription_id = $1 and type in ('conflict', 'refill') and status <> 'resolved'`, [
      rx.id,
    ]);
    await audit(req, 'prescription_stop', 'prescription', rx.id);
    res.json({ ok: true });
  }),
);

prescriptionsRouter.post(
  '/:id/refills',
  requireRole('caregiver', 'asha', 'doctor', 'admin'),
  ah(async (req, res) => {
    const rx = await loadRx(idParam(req));
    await assertPatientAccess(req.user!, rx.patientId);
    const b = parse(refillSchema, req.body);
    await q('insert into refills (prescription_id, patient_id, quantity_added, note, recorded_by) values ($1, $2, $3, $4, $5)', [
      rx.id,
      rx.patientId,
      b.quantity,
      b.note ?? null,
      req.user!.id,
    ]);
    await q('update prescriptions set current_quantity = least(1000, current_quantity + $2), updated_at = now() where id = $1', [rx.id, b.quantity]);
    await q(`update alerts set status = 'resolved' where prescription_id = $1 and type = 'refill' and status <> 'resolved'`, [rx.id]);
    await audit(req, 'refill_record', 'prescription', rx.id, { quantity: b.quantity });
    res.status(201).json({ ok: true });
  }),
);
