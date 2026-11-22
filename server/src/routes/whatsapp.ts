import { Router } from 'express';
import { config } from '../config';
import { q } from '../db';
import { ah } from '../http';
import { requireRole } from '../middleware/auth';
import { accessiblePatientIds } from '../services/access';
import { waLink, whatsappMode } from '../services/whatsapp';

/** WhatsApp alerts sent (or ready to send) to caregivers about repeated missed doses. */
export const whatsappRouter = Router();

whatsappRouter.get(
  '/',
  requireRole('caregiver', 'asha', 'doctor', 'admin'),
  ah(async (req, res) => {
    const ids = await accessiblePatientIds(req.user!);
    const only = Number(req.query.patientId);
    const scope = Number.isInteger(only) && ids.includes(only) ? [only] : ids;
    const rows = scope.length
      ? await q(
          `select w.id, w.patient_id, p.name as patient_name, u.name as to_name, w.phone, w.body, w.reason, w.status, w.error, w.created_at
           from whatsapp_messages w join patients p on p.id = w.patient_id left join users u on u.id = w.user_id
           where w.patient_id in (${scope.map(Number).join(',')})
             and ($1::text <> 'caregiver' or w.user_id = $2)
           order by w.created_at desc limit 30`,
          [req.user!.role, req.user!.id],
        )
      : [];
    res.json({
      mode: whatsappMode(),
      rule: { threshold: config.whatsapp.missThreshold, hours: config.whatsapp.windowHours },
      messages: rows.map((r) => ({
        id: Number(r.id),
        patientId: Number(r.patient_id),
        patientName: r.patient_name,
        toName: r.to_name,
        phone: String(r.phone).replace(/\D/g, '').slice(-10),
        body: r.body,
        reason: r.reason,
        status: r.status,
        error: r.error,
        createdAt: r.created_at,
        waUrl: waLink(r.phone, r.body),
      })),
    });
  }),
);
