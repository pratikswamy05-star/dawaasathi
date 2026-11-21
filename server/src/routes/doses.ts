import { Router } from 'express';
import { ah, idParam, parse } from '../http';
import { audit } from '../services/audit';
import { confirmDose } from '../services/doses';
import { confirmSchema, syncSchema } from '../validation';

export const dosesRouter = Router();

/** TAKEN / MISSED from the patient (button or voice), caregiver or ASHA. */
dosesRouter.post(
  '/:id/confirm',
  ah(async (req, res) => {
    const id = idParam(req);
    const b = parse(confirmSchema, req.body);
    const r = await confirmDose(req.user!, id, b);
    if (r.changed) await audit(req, `dose_${b.status}`, 'dose_log', id, { method: b.method });
    res.json({ dose: r.dose });
  }),
);

/** Offline queue flush: applies each item independently and reports per-item results. */
dosesRouter.post(
  '/sync',
  ah(async (req, res) => {
    const { items } = parse(syncSchema, req.body);
    const results: { doseId: number; ok: boolean; error?: string }[] = [];
    for (const it of items) {
      try {
        const r = await confirmDose(req.user!, it.doseId, it);
        if (r.changed) await audit(req, `dose_${it.status}`, 'dose_log', it.doseId, { method: it.method, offline: true });
        results.push({ doseId: it.doseId, ok: true });
      } catch (e) {
        results.push({ doseId: it.doseId, ok: false, error: e instanceof Error ? e.message : 'failed' });
      }
    }
    res.json({ results });
  }),
);
