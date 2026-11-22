/**
 * Emergency health card (QR) and the ASHA worker's daily visit planner.
 */
import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../db';
import { scheduleTimes } from '../domain/schedule';
import { formatVital, type VitalKind } from '../domain/vitals';
import { ah, HttpError, idParam, parse } from '../http';
import { requireRole } from '../middleware/auth';
import { accessiblePatientIds, assertPatientAccess, recipientUserIds } from '../services/access';
import { notifyUsers } from '../services/alerts';
import { audit } from '../services/audit';
import { patientRow, patientSummary, today } from '../services/overview';
import { activePrescriptions } from '../services/prescriptions';
import { streakFor } from '../services/streak';

/* ------------------------------------------------------------------ */
/* Emergency card: /api/patients/:id/emergency-card                     */
/* ------------------------------------------------------------------ */
export const emergencyRouter = Router({ mergeParams: true });

const cardSchema = z
  .object({
    bloodGroup: z
      .string()
      .trim()
      .regex(/^$|^(A|B|AB|O)[+-]$/, 'Use a blood group like B+ or O-')
      .optional(),
    allergies: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(300).optional(),
  })
  .strict();

const FOOD: Record<string, string> = { before: 'before food', after: 'after food', with: 'with food', none: '' };

emergencyRouter.get(
  '/',
  ah(async (req, res) => {
    const id = idParam(req);
    await assertPatientAccess(req.user!, id);
    const p = await patientRow(id);
    if (!p) throw new HttpError(404, 'Patient not found');
    const extra = await one('select blood_group, allergies, emergency_notes from patients where id = $1', [id]);
    const rxs = await activePrescriptions(id);
    const vit = await q(
      `select distinct on (kind) kind, value1, value2, measured_at from vitals where patient_id = $1 and kind in ('bp','sugar_fasting','sugar_random') order by kind, measured_at desc`,
      [id],
    );
    res.json({
      patient: {
        id,
        name: p.name,
        age: p.age,
        gender: p.gender,
        village: p.village,
        phone: p.phone,
        conditions: (p.conditions ?? []) as string[],
        bloodGroup: extra?.blood_group ?? null,
        allergies: extra?.allergies ?? null,
        notes: extra?.emergency_notes ?? null,
      },
      medicines: rxs.map((rx) => ({
        name: rx.medication_name,
        dosage: rx.dosage,
        times: scheduleTimes({ frequency: rx.frequency, foodRule: rx.food_rule, times: rx.times ?? [] }),
        food: FOOD[rx.food_rule] ?? '',
        ingredients: rx.active_ingredients ?? [],
      })),
      contacts: [
        p.caregiver_name && { role: 'Family', name: `${p.caregiver_name}${p.caregiver_relation ? ` (${p.caregiver_relation})` : ''}`, phone: p.caregiver_phone },
        p.asha_name && { role: 'ASHA worker', name: p.asha_name, phone: p.asha_phone },
        p.doctor_name && { role: 'Doctor', name: `${p.doctor_name}${p.doctor_facility ? `, ${p.doctor_facility}` : ''}`, phone: null },
      ].filter(Boolean),
      latestReadings: vit.map((v) => ({
        kind: v.kind,
        display: formatVital(v.kind as VitalKind, Number(v.value1), v.value2 == null ? null : Number(v.value2)),
        at: v.measured_at,
      })),
      generatedAt: new Date().toISOString(),
    });
  }),
);

emergencyRouter.put(
  '/',
  requireRole('patient', 'caregiver', 'asha', 'doctor', 'admin'),
  ah(async (req, res) => {
    const id = idParam(req);
    await assertPatientAccess(req.user!, id);
    const b = parse(cardSchema, req.body);
    await q(
      `update patients set blood_group = coalesce($2, blood_group), allergies = coalesce($3, allergies), emergency_notes = coalesce($4, emergency_notes), updated_at = now() where id = $1`,
      [id, b.bloodGroup === undefined ? null : b.bloodGroup || null, b.allergies ?? null, b.notes ?? null],
    );
    await audit(req, 'emergency_card_update', 'patient', id, { fields: Object.keys(b) });
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------ */
/* ASHA visit planner: /api/visits                                      */
/* ------------------------------------------------------------------ */
export const visitsRouter = Router();

const visitSchema = z
  .object({
    patientId: z.coerce.number().int().positive(),
    status: z.enum(['visited', 'not_home']),
    note: z.string().trim().max(300).optional().default(''),
  })
  .strict();

type Reason = { code: string; text: string; weight: number; tone: 'red' | 'amber' | 'green' | 'slate' };

visitsRouter.get(
  '/',
  requireRole('asha', 'admin'),
  ah(async (req, res) => {
    const ids = await accessiblePatientIds(req.user!);
    const t = today();
    const list = await Promise.all(
      ids.map(async (id) => {
        const [s, p, alerts, lastVisit, todayVisit, streak, urgent] = await Promise.all([
          patientSummary(id),
          patientRow(id),
          q(`select type from alerts where patient_id = $1 and status <> 'resolved'`, [id]),
          one(`select visit_date, status from asha_visits where patient_id = $1 and status = 'visited' order by visit_date desc limit 1`, [id]),
          one(`select status, note from asha_visits where patient_id = $1 and visit_date = $2`, [id, t]),
          streakFor(id, 30),
          one(`select count(*)::int as n from vitals where patient_id = $1 and level in ('high','urgent') and measured_at > now() - interval '3 days'`, [id]),
        ]);
        const reasons: Reason[] = [];
        const types = new Set(alerts.map((a) => a.type as string));
        if (types.has('help')) reasons.push({ code: 'help', text: 'HELP requested', weight: 100, tone: 'red' });
        if (Number(urgent?.n ?? 0) > 0) reasons.push({ code: 'vitals', text: 'High BP / sugar readings', weight: 70, tone: 'red' });
        if (s.missedToday > 0) reasons.push({ code: 'missed_today', text: `${s.missedToday} missed today`, weight: 40, tone: 'red' });
        if (s.missed7d >= 3) reasons.push({ code: 'missed_week', text: `${s.missed7d} missed this week`, weight: 30, tone: 'amber' });
        if (s.refillStatus === 'critical') reasons.push({ code: 'refill', text: `Medicine runs out in ${s.refillDaysLeft ?? '?'} days`, weight: 30, tone: 'red' });
        else if (s.refillStatus === 'soon') reasons.push({ code: 'refill', text: 'Refill due soon', weight: 10, tone: 'amber' });
        if (types.has('conflict')) reasons.push({ code: 'conflict', text: 'Prescription warning to check', weight: 15, tone: 'amber' });
        if (s.risk.level === 'high') reasons.push({ code: 'risk', text: 'High risk', weight: 25, tone: 'red' });
        else if (s.risk.level === 'medium') reasons.push({ code: 'risk', text: 'Medium risk', weight: 10, tone: 'amber' });
        const daysSince = lastVisit ? Math.round((Date.parse(t) - Date.parse(String(lastVisit.visit_date).slice(0, 10))) / 86_400_000) : null;
        if (daysSince == null || daysSince >= 14) reasons.push({ code: 'routine', text: daysSince == null ? 'Not visited yet' : `Last visit ${daysSince} days ago`, weight: 5, tone: 'slate' });
        if (streak.current >= 7) reasons.push({ code: 'praise', text: `🌟 ${streak.current}-day streak — praise her!`, weight: 1, tone: 'green' });
        const priority = reasons.reduce((n, r) => n + r.weight, 0);
        return {
          patientId: id,
          name: s.name,
          age: s.age,
          village: s.village ?? 'Unknown',
          phone: p?.phone ?? null,
          caregiverName: p?.caregiver_name ?? null,
          caregiverPhone: p?.caregiver_phone ?? null,
          risk: s.risk,
          streak: streak.current,
          priority,
          urgent: reasons.some((r) => r.weight >= 40),
          reasons: reasons.sort((a, b) => b.weight - a.weight),
          lastVisit: lastVisit ? String(lastVisit.visit_date).slice(0, 10) : null,
          today: todayVisit ? { status: todayVisit.status, note: todayVisit.note } : null,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.village ?? ''}, Hassan, Karnataka`)}`,
        };
      }),
    );
    const visits = list.sort((a, b) => b.priority - a.priority || String(a.name).localeCompare(String(b.name)));
    res.json({
      date: t,
      visits,
      counts: {
        total: visits.length,
        urgent: visits.filter((v) => v.urgent && !v.today).length,
        done: visits.filter((v) => v.today).length,
      },
    });
  }),
);

visitsRouter.post(
  '/',
  requireRole('asha', 'admin'),
  ah(async (req, res) => {
    const b = parse(visitSchema, req.body);
    await assertPatientAccess(req.user!, b.patientId);
    const t = today();
    await q(
      `insert into asha_visits (patient_id, visit_date, status, note, visited_by) values ($1, $2, $3, $4, $5)
       on conflict (patient_id, visit_date) do update set status = excluded.status, note = excluded.note, visited_by = excluded.visited_by, created_at = now()`,
      [b.patientId, t, b.status, b.note || null, req.user!.id],
    );
    if (b.status === 'visited') {
      const p = await one('select name from patients where id = $1', [b.patientId]);
      await notifyUsers(await recipientUserIds(b.patientId, 'caregiver'), {
        type: 'visit',
        title: 'ASHA home visit',
        body: `${req.user!.name} visited ${p?.name} today.${b.note ? ` Note: ${b.note}` : ''}`,
      });
    }
    await audit(req, `visit_${b.status}`, 'patient', b.patientId, { date: t });
    res.status(201).json({ ok: true, date: t, status: b.status });
  }),
);
