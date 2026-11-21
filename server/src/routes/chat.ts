import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { now } from '../clock';
import { config } from '../config';
import { one, q } from '../db';
import { chatReply, type ChatContext, type Lang } from '../domain/chatbot';
import { predictRefill } from '../domain/refill';
import { dosesPerDay, scheduleTimes } from '../domain/schedule';
import { fmt12, hhmmOf } from '../domain/time';
import { ah, HttpError, parse } from '../http';
import { requireRole } from '../middleware/auth';
import { assertPatientAccess } from '../services/access';
import { audit } from '../services/audit';
import { dosesForDay } from '../services/doses';
import { today } from '../services/overview';
import { activePrescriptions } from '../services/prescriptions';

export const chatRouter = Router();

const chatSchema = z
  .object({
    message: z.string().trim().min(1, 'Type a question').max(300, 'Please keep it shorter'),
    patientId: z.coerce.number().int().positive().optional(),
    lang: z.enum(['en', 'kn', 'hi']).optional(),
  })
  .strict();

const limiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many questions. Please wait a minute.' } });

/** Builds the chatbot's view of ONE patient (after the access check). */
export async function contextFor(patientId: number): Promise<ChatContext> {
  const [p, doses, rxs, catalog] = await Promise.all([
    one('select name from patients where id = $1', [patientId]),
    dosesForDay(patientId, today()),
    activePrescriptions(patientId),
    q('select name, active_ingredients, category, instructions from medications'),
  ]);
  const nowMs = now().getTime();
  return {
    patientName: p?.name ?? '',
    today: doses.map((d) => ({
      name: d.medication_name,
      time: fmt12(hhmmOf(new Date(d.scheduled_at))),
      status: d.status,
      foodRule: d.food_rule,
      due: new Date(d.scheduled_at).getTime() <= nowMs,
    })),
    prescriptions: rxs.map((r) => {
      const sched = { frequency: r.frequency, foodRule: r.food_rule, times: r.times ?? [] };
      const pred = predictRefill(
        { currentQuantity: r.current_quantity, unitsPerDose: r.units_per_dose, dosesPerDay: dosesPerDay(sched), today: today(), endDate: r.end_date },
        config.refill,
      );
      return {
        name: r.medication_name,
        ingredients: r.active_ingredients ?? [],
        dosage: r.dosage,
        schedule: scheduleTimes(sched).map(fmt12).join(', ') || '—',
        foodRule: r.food_rule,
        remaining: r.current_quantity,
        daysLeft: pred.daysLeft,
        refillBy: pred.refillBy,
        stock: pred.status,
      };
    }),
    catalog: catalog.map((m) => ({ name: m.name, ingredients: m.active_ingredients ?? [], category: m.category, instructions: m.instructions })),
  };
}

/**
 * POST /api/chat — patients ask about their own medicines; caregivers, ASHA workers and doctors
 * ask on behalf of a linked patient (patientId). Questions are NOT stored; only the intent is audited.
 */
chatRouter.post(
  '/',
  limiter,
  requireRole('patient', 'caregiver', 'asha', 'doctor', 'admin'),
  ah(async (req, res) => {
    const b = parse(chatSchema, req.body);
    let patientId = b.patientId;
    if (req.user!.role === 'patient') {
      const own = await one('select id from patients where user_id = $1', [req.user!.id]);
      if (!own) throw new HttpError(404, 'No patient record is linked to this account');
      patientId = Number(own.id);
    }
    if (!patientId) throw new HttpError(400, 'Choose a patient first');
    await assertPatientAccess(req.user!, patientId);
    const lang: Lang = b.lang ?? ((await one('select language from users where id = $1', [req.user!.id]))?.language as Lang) ?? 'en';
    const reply = chatReply(b.message, lang, await contextFor(patientId));
    await audit(req, 'chat_query', 'patient', patientId, { intent: reply.intent });
    res.json({ reply });
  }),
);
