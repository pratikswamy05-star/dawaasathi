/**
 * v4 features: vitals log, teleconsult booking, weekly report, pill photo match,
 * Jan Aushadhi / pharmacy finder, and SMS / WhatsApp alert previews.
 */
import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import { now } from '../clock';
import { one, q } from '../db';
import { distanceKm, monthlySaving } from '../domain/geo';
import { matchMedicines } from '../domain/pillMatch';
import { dosesPerDay } from '../domain/schedule';
import { addDays, atLocal } from '../domain/time';
import { classifyVital, formatVital, persistentHigh, VITAL_INFO, weightChangeLevel, type VitalKind, type VitalLevel } from '../domain/vitals';
import { ah, HttpError, idParam, parse } from '../http';
import { requireRole } from '../middleware/auth';
import { accessiblePatientIds, assertPatientAccess, recipientUserIds } from '../services/access';
import { createAlert, notifyUsers } from '../services/alerts';
import { audit } from '../services/audit';
import { patientOverview, patientRow, today } from '../services/overview';
import { activePrescriptions } from '../services/prescriptions';
import { pillMatchSchema, teleconsultCreateSchema, teleconsultUpdateSchema, vitalSchema } from '../validation';

const LEVEL_RANK: Record<VitalLevel, number> = { normal: 0, watch: 1, high: 2, urgent: 3 };

/* ------------------------------------------------------------------ */
/* Vitals: /api/patients/:id/vitals                                    */
/* ------------------------------------------------------------------ */
export const vitalsRouter = Router({ mergeParams: true });

vitalsRouter.get(
  '/',
  ah(async (req, res) => {
    const id = idParam(req);
    await assertPatientAccess(req.user!, id);
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const from = addDays(today(), -days);
    const rows = await q(
      `select v.id, v.kind, v.value1, v.value2, v.level, v.note, v.measured_at, u.name as recorded_by_name, u.role as recorded_by_role
       from vitals v left join users u on u.id = v.recorded_by
       where v.patient_id = $1 and v.measured_at >= $2 order by v.measured_at desc limit 500`,
      [id, atLocal(from, '00:00').toISOString()],
    );
    const vitals = rows.map((r) => ({
      ...r,
      value1: Number(r.value1),
      value2: r.value2 == null ? null : Number(r.value2),
      display: formatVital(r.kind, Number(r.value1), r.value2 == null ? null : Number(r.value2)),
      advice: classifyVital(r.kind, Number(r.value1), r.value2 == null ? null : Number(r.value2)).advice,
    }));
    // Latest reading of each kind, for summary tiles.
    const latest: Record<string, unknown> = {};
    for (const v of vitals) if (!latest[v.kind]) latest[v.kind] = v;
    res.json({ vitals, latest, kinds: VITAL_INFO });
  }),
);

/** Validates and saves one reading, raises alerts, and returns the result. Shared by the form and the voice assistant. */
export async function recordVital(req: Request, id: number, input: unknown) {
    const b = parse(vitalSchema, input);
    const info = VITAL_INFO[b.kind];
    const v2 = b.kind === 'bp' ? (b.value2 ?? null) : null;
    if (b.value1 < info.min || b.value1 > info.max) throw new HttpError(400, `${info.label} must be between ${info.min} and ${info.max} ${info.unit}. Please check the number.`);
    if (v2 != null && (v2 < info.min2! || v2 > info.max2!)) throw new HttpError(400, `The lower BP number must be between ${info.min2} and ${info.max2}.`);
    if (v2 != null && v2 >= b.value1) throw new HttpError(400, 'For blood pressure, write the bigger number first (e.g. 130 / 85).');
    const measuredAt = b.measuredAt ? new Date(b.measuredAt) : now();
    if (measuredAt.getTime() > now().getTime() + 5 * 60000) throw new HttpError(400, 'The reading time cannot be in the future.');

    const result = classifyVital(b.kind, b.value1, v2);
    let level = result.level;
    if (b.kind === 'weight') {
      const prev = await one(`select value1 from vitals where patient_id = $1 and kind = 'weight' order by measured_at desc limit 1`, [id]);
      level = weightChangeLevel(prev ? Number(prev.value1) : null, b.value1);
    }

    const row = await one(
      `insert into vitals (patient_id, kind, value1, value2, level, note, recorded_by, measured_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, kind, value1, value2, level, note, measured_at`,
      [id, b.kind, b.value1, v2, level, b.note || null, req.user!.id, measuredAt.toISOString()],
    );
    const vitalId = Number(row!.id);
    await audit(req, 'vital_record', 'patient', id, { kind: b.kind, level });

    // Alerts: urgent → caregiver + ASHA + doctor; high → ASHA + doctor; three highs in a row → doctor.
    const p = await patientRow(id);
    const display = formatVital(b.kind, b.value1, v2);
    const alerted: string[] = [];
    if (LEVEL_RANK[level] >= LEVEL_RANK.high) {
      const roles = level === 'urgent' ? (['caregiver', 'asha', 'doctor'] as const) : (['asha', 'doctor'] as const);
      const dir = result.direction === 'low' ? 'low' : 'high';
      for (const role of roles) {
        const created = await createAlert({
          patientId: id,
          type: 'vitals',
          severity: level === 'urgent' ? 'high' : 'medium',
          targetRole: role,
          message: `${p?.name}: ${info.label} ${display} is ${level === 'urgent' ? 'very ' : ''}${dir}. Please check on them${role === 'doctor' ? ' and review' : ''}.`,
          dedupeKey: `vital-${vitalId}-${role}`,
        });
        if (created) alerted.push(role);
      }
    }
    if (!alerted.includes('doctor')) {
      const recent = await q(`select level from vitals where patient_id = $1 and kind = $2 order by measured_at desc limit 3`, [id, b.kind]);
      if (persistentHigh(recent.map((r) => r.level as VitalLevel))) {
        const created = await createAlert({
          patientId: id,
          type: 'vitals',
          severity: 'medium',
          targetRole: 'doctor',
          message: `${p?.name}: last 3 ${info.label.toLowerCase()} readings are all outside the usual range (latest ${display}). Please review.`,
          dedupeKey: `vital-trend-${id}-${b.kind}-${vitalId}`,
        });
        if (created) alerted.push('doctor');
      }
    }

    return ({
      vital: { ...row, value1: Number(row!.value1), value2: row!.value2 == null ? null : Number(row!.value2), display, advice: result.advice },
      level,
      advice: level === result.level ? result.advice : 'Weight changed by 3 kg or more since the last reading. Please tell your ASHA worker.',
      alerted,
    });
}

vitalsRouter.post(
  '/',
  requireRole('patient', 'caregiver', 'asha', 'doctor', 'admin'),
  ah(async (req, res) => {
    const id = idParam(req);
    await assertPatientAccess(req.user!, id);
    res.status(201).json(await recordVital(req, id, req.body));
  }),
);

/* ------------------------------------------------------------------ */
/* Weekly report: /api/patients/:id/weekly-report                            */
/* ------------------------------------------------------------------ */
export const reportRouter = Router({ mergeParams: true });

reportRouter.get(
  '/',
  ah(async (req, res) => {
    const id = idParam(req);
    await assertPatientAccess(req.user!, id);
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 31);
    const fromDate = addDays(today(), -(days - 1));
    const from = atLocal(fromDate, '00:00').toISOString();
    const [ov, missed, vitals, consults, alerts] = await Promise.all([
      patientOverview(id),
      q(
        `select d.scheduled_at, m.name as medication_name, p.dosage from dose_logs d
         join prescriptions p on p.id = d.prescription_id join medications m on m.id = p.medication_id
         where d.patient_id = $1 and d.status = 'missed' and d.scheduled_at >= $2 order by d.scheduled_at desc limit 50`,
        [id, from],
      ),
      q(`select kind, value1, value2, level, measured_at from vitals where patient_id = $1 and measured_at >= $2 order by measured_at desc`, [id, from]),
      q(`select reason, status, scheduled_at, doctor_note, created_at from teleconsults where patient_id = $1 order by created_at desc limit 5`, [id]),
      q(`select type, severity, message, status, created_at from alerts where patient_id = $1 and created_at >= $2 order by created_at desc limit 30`, [id, from]),
    ]);
    const series = ov.series.slice(-days);
    const taken = series.reduce((s, d) => s + d.taken, 0);
    const missedN = series.reduce((s, d) => s + d.missed, 0);
    await audit(req, 'report_view', 'patient', id, { days });
    res.json({
      generatedAt: now().toISOString(),
      from: fromDate,
      to: today(),
      days,
      patient: ov.patient,
      adherence: { taken, missed: missedN, pct: taken + missedN ? Math.round((taken / (taken + missedN)) * 100) : null },
      series,
      prescriptions: ov.prescriptions,
      refills: ov.refills,
      conflicts: ov.conflicts,
      risk: ov.risk,
      missedDoses: missed,
      vitals: vitals.map((v) => ({
        ...v,
        display: formatVital(v.kind, Number(v.value1), v.value2 == null ? null : Number(v.value2)),
        label: VITAL_INFO[v.kind as VitalKind].label,
      })),
      teleconsults: consults,
      alerts,
    });
  }),
);

/* ------------------------------------------------------------------ */
/* Teleconsults: /api/teleconsults                                     */
/* ------------------------------------------------------------------ */
export const teleconsultRouter = Router();

const TC_SELECT = `
  select t.*, p.name as patient_name, p.village, du.name as doctor_name, ru.name as requested_by_name, ru.role as requested_by_role
  from teleconsults t join patients p on p.id = t.patient_id
  left join doctors d on d.id = t.doctor_id left join users du on du.id = d.user_id
  left join users ru on ru.id = t.requested_by`;

const withLink = (t: Record<string, unknown>) => ({ ...t, joinUrl: t.room && t.status === 'confirmed' ? `https://meet.jit.si/${t.room}` : null });

teleconsultRouter.get(
  '/',
  ah(async (req, res) => {
    const ids = await accessiblePatientIds(req.user!);
    if (!ids.length) return res.json({ teleconsults: [] });
    const rows = await q(
      `${TC_SELECT} where t.patient_id in (${ids.map(Number).join(',')})
       order by (t.status = 'requested') desc, (t.status = 'confirmed') desc, coalesce(t.scheduled_at, t.created_at) desc limit 100`,
    );
    res.json({ teleconsults: rows.map(withLink) });
  }),
);

teleconsultRouter.post(
  '/',
  requireRole('patient', 'caregiver', 'asha', 'admin'),
  ah(async (req, res) => {
    const b = parse(teleconsultCreateSchema, req.body);
    let patientId = b.patientId;
    if (req.user!.role === 'patient') {
      const mine = await one('select id from patients where user_id = $1', [req.user!.id]);
      if (!mine) throw new HttpError(404, 'No patient record is linked to this account');
      patientId = Number(mine.id);
    }
    if (!patientId) throw new HttpError(400, 'Choose a patient');
    await assertPatientAccess(req.user!, patientId);
    const open = await one(`select count(*)::int as n from teleconsults where patient_id = $1 and status in ('requested', 'confirmed')`, [patientId]);
    if (Number(open?.n ?? 0) >= 2) throw new HttpError(409, 'There are already 2 open consultation requests for this patient. Please wait for the doctor.');
    const p = await one('select doctor_id, name from patients where id = $1', [patientId]);
    if (!p?.doctor_id) throw new HttpError(400, 'This patient has no doctor assigned yet. Ask the ASHA worker or admin to assign one.');
    const row = await one(
      `insert into teleconsults (patient_id, doctor_id, requested_by, reason, preferred_at) values ($1, $2, $3, $4, $5) returning id`,
      [patientId, p.doctor_id, req.user!.id, b.reason, b.preferredAt ?? null],
    );
    const tcId = Number(row!.id);
    await createAlert({
      patientId,
      type: 'teleconsult',
      severity: 'low',
      targetRole: 'doctor',
      message: `${p.name}: video consultation requested by ${req.user!.name}. Reason: ${b.reason}`,
      dedupeKey: `tc-${tcId}-request`,
    });
    await audit(req, 'teleconsult_request', 'teleconsult', tcId, { patientId });
    res.status(201).json({ teleconsult: withLink((await one(`${TC_SELECT} where t.id = $1`, [tcId]))!) });
  }),
);

teleconsultRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const id = idParam(req);
    const b = parse(teleconsultUpdateSchema, req.body);
    const t = await one('select * from teleconsults where id = $1', [id]);
    if (!t) throw new HttpError(404, 'Consultation not found');
    await assertPatientAccess(req.user!, Number(t.patient_id));
    const role = req.user!.role;
    const isDoctor = role === 'doctor' || role === 'admin';
    if (!isDoctor && !(b.status === 'cancelled' && Number(t.requested_by) === req.user!.id))
      throw new HttpError(403, 'Only the doctor can confirm or complete a consultation. You can cancel your own request.');
    if (t.status === 'completed' || t.status === 'cancelled') throw new HttpError(409, `This consultation is already ${t.status}.`);
    if (b.status === 'completed' && t.status !== 'confirmed') throw new HttpError(409, 'Confirm the consultation before marking it completed.');

    let room = t.room as string | null;
    let scheduledAt = t.scheduled_at as string | null;
    if (b.status === 'confirmed') {
      if (!b.scheduledAt) throw new HttpError(400, 'Choose a date and time for the call');
      if (new Date(b.scheduledAt).getTime() < now().getTime() - 10 * 60000) throw new HttpError(400, 'The call time cannot be in the past.');
      scheduledAt = b.scheduledAt;
      room = room ?? `DawaaSathi-${crypto.randomBytes(6).toString('hex')}`;
    }
    await q(`update teleconsults set status = $2, scheduled_at = $3, room = $4, doctor_note = coalesce($5, doctor_note), updated_at = now() where id = $1`, [
      id,
      b.status,
      scheduledAt,
      room,
      b.doctorNote ?? null,
    ]);

    const p = await one('select name from patients where id = $1', [t.patient_id]);
    const when = scheduledAt ? new Date(scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) : '';
    const body =
      b.status === 'confirmed'
        ? `Video call with the doctor for ${p?.name} on ${when}. Open DawaaSathi → Doctor to join.`
        : b.status === 'completed'
          ? `Consultation for ${p?.name} is complete.${b.doctorNote ? ` Doctor's note: ${b.doctorNote}` : ''}`
          : `Consultation request for ${p?.name} was cancelled.`;
    const users = new Set<number>();
    for (const r of ['patient', 'caregiver', 'asha'] as const) for (const u of await recipientUserIds(Number(t.patient_id), r)) users.add(u);
    if (role !== 'doctor') for (const u of await recipientUserIds(Number(t.patient_id), 'doctor')) users.add(u);
    users.delete(req.user!.id);
    await notifyUsers([...users], { type: 'teleconsult', title: 'Doctor consultation', body });
    await audit(req, `teleconsult_${b.status}`, 'teleconsult', id);
    res.json({ teleconsult: withLink((await one(`${TC_SELECT} where t.id = $1`, [id]))!) });
  }),
);

/* ------------------------------------------------------------------ */
/* Pill photo match: /api/scan/match                                   */
/* ------------------------------------------------------------------ */
export const scanRouter = Router();

scanRouter.post(
  '/match',
  ah(async (req, res) => {
    const b = parse(pillMatchSchema, req.body);
    const meds = await q('select id, name, active_ingredients, strength, category, instructions, generic_name, brand_price, generic_price from medications order by name');
    const matches = matchMedicines(
      b.text,
      meds.map((m) => ({ id: Number(m.id), name: m.name, ingredients: m.active_ingredients ?? [], strength: m.strength })),
    );

    // Compare with what the patient already takes: same medicine, or same ingredient under another name.
    let patientId = b.patientId ?? null;
    if (req.user!.role === 'patient') {
      const mine = await one('select id from patients where user_id = $1', [req.user!.id]);
      patientId = mine ? Number(mine.id) : null;
    }
    let current: Record<string, unknown>[] = [];
    if (patientId) {
      await assertPatientAccess(req.user!, patientId);
      current = await activePrescriptions(patientId);
    }

    const results = matches.map((mt) => {
      const m = meds.find((x) => Number(x.id) === mt.id)!;
      const ingr: string[] = m.active_ingredients ?? [];
      const same = current.find((rx) => Number(rx.medication_id) === mt.id);
      const overlap = current.filter(
        (rx) => Number(rx.medication_id) !== mt.id && ((rx.active_ingredients as string[]) ?? []).some((i) => ingr.includes(i)),
      );
      let status: 'prescribed' | 'duplicate' | 'not_prescribed' | 'unknown' = patientId ? 'not_prescribed' : 'unknown';
      let note = patientId ? 'This medicine is not on the current prescription list. Ask the doctor or ASHA worker before taking it.' : '';
      if (same) {
        status = 'prescribed';
        note = `This is on the prescription: ${same.dosage ?? m.strength ?? ''} — take it as prescribed.`;
      } else if (overlap.length) {
        status = 'duplicate';
        note = `Careful: this contains ${ingr.join(' + ')}, the same as ${overlap.map((o) => o.medication_name).join(', ')} already prescribed. Do NOT take both — ask the doctor.`;
      }
      return {
        id: mt.id,
        name: m.name,
        ingredients: ingr,
        strength: m.strength,
        category: m.category,
        instructions: m.instructions,
        genericName: m.generic_name,
        brandPrice: m.brand_price == null ? null : Number(m.brand_price),
        genericPrice: m.generic_price == null ? null : Number(m.generic_price),
        confidence: mt.score >= 5 ? 'high' : mt.score >= 3 ? 'medium' : 'low',
        matchedWords: mt.matchedWords,
        status,
        note,
      };
    });
    await audit(req, 'pill_scan', 'patient', patientId, { found: results.length });
    res.json({ results, patientId });
  }),
);

/* ------------------------------------------------------------------ */
/* Pharmacy / Jan Aushadhi finder: /api/pharmacies                     */
/* ------------------------------------------------------------------ */
export const pharmacyRouter = Router();

pharmacyRouter.get(
  '/',
  ah(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const hasLoc = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    const kind = typeof req.query.kind === 'string' && ['jan_aushadhi', 'phc', 'private'].includes(req.query.kind) ? req.query.kind : null;
    const rows = await q(`select * from pharmacies ${kind ? 'where kind = $1' : ''} order by name`, kind ? [kind] : []);

    // Default location: the patient's village (first match), else Hassan town.
    let origin = hasLoc ? { lat, lng, label: 'your location' } : null;
    let patientId: number | null = null;
    if (req.user!.role === 'patient') {
      const mine = await one('select id, village from patients where user_id = $1', [req.user!.id]);
      patientId = mine ? Number(mine.id) : null;
      if (!origin && mine?.village) {
        const near = rows.find((r) => String(r.area).toLowerCase() === String(mine.village).toLowerCase());
        if (near) origin = { lat: Number(near.lat), lng: Number(near.lng), label: String(mine.village) };
      }
    } else if (req.query.patientId) {
      patientId = Number(req.query.patientId);
      await assertPatientAccess(req.user!, patientId);
    }
    origin = origin ?? { lat: 13.0072, lng: 76.0962, label: 'Hassan' };

    const pharmacies = rows
      .map((r) => ({
        ...r,
        lat: Number(r.lat),
        lng: Number(r.lng),
        distanceKm: Math.round(distanceKm(origin!.lat, origin!.lng, Number(r.lat), Number(r.lng)) * 10) / 10,
        directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`,
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const meds = await q('select id, name, generic_name, strength, brand_price, generic_price from medications where generic_price is not null order by name');
    let savings: { medicationName: string; brandPrice: number; genericPrice: number; perMonth: number | null }[] = [];
    if (patientId) {
      const rxs = await activePrescriptions(patientId);
      savings = rxs
        .map((rx) => {
          const m = meds.find((x) => Number(x.id) === Number(rx.medication_id));
          if (!m) return null;
          const perDay = dosesPerDay({ frequency: rx.frequency, foodRule: rx.food_rule, times: rx.times ?? [] }) * Number(rx.units_per_dose ?? 1);
          return {
            medicationName: String(m.name),
            genericName: m.generic_name,
            brandPrice: Number(m.brand_price),
            genericPrice: Number(m.generic_price),
            perMonth: monthlySaving(Number(m.brand_price), Number(m.generic_price), perDay),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null);
    }
    res.json({
      origin,
      pharmacies,
      prices: meds.map((m) => ({ ...m, brand_price: Number(m.brand_price), generic_price: Number(m.generic_price) })),
      savings,
      totalMonthlySaving: savings.reduce((s, x) => s + (x.perMonth ?? 0), 0),
      searchUrl: 'https://www.google.com/maps/search/Jan+Aushadhi+Kendra+near+me',
      note: 'Demo data: pharmacy list and prices are samples for this prototype. Always confirm the price and availability at the shop.',
    });
  }),
);

/* ------------------------------------------------------------------ */
/* SMS / WhatsApp preview: /api/alerts/:id/message                      */
/* ------------------------------------------------------------------ */
const ACTION: Record<string, string> = {
  missed_dose: 'Please check whether the medicine was taken. Do not give a double dose.',
  repeated_miss: 'Several doses were missed. Please visit and help with the routine.',
  refill: 'Please arrange a refill before the medicine runs out.',
  conflict: 'Ask the doctor to review these prescriptions before the next dose.',
  help: 'HELP was pressed. Please call or visit now.',
  vitals: 'Please check the reading again and inform the doctor / ASHA worker.',
  teleconsult: 'Doctor consultation update.',
};
const HEADER: Record<string, string> = { en: 'DawaaSathi alert', kn: 'ದವಾ ಸಾಥಿ ಎಚ್ಚರಿಕೆ', hi: 'दवा साथी अलर्ट' };
const FOOTER: Record<string, string> = {
  en: 'Never give an extra dose. Ask the doctor if unsure. Emergency: 108',
  kn: 'ಹೆಚ್ಚುವರಿ ಡೋಸ್ ಕೊಡಬೇಡಿ. ಸಂಶಯವಿದ್ದರೆ ವೈದ್ಯರನ್ನು ಕೇಳಿ. ತುರ್ತು: 108',
  hi: 'अतिरिक्त खुराक न दें। संदेह हो तो डॉक्टर से पूछें। आपातकाल: 108',
};

export const alertMessageRouter = Router();

alertMessageRouter.get(
  '/:id/message',
  requireRole('caregiver', 'asha', 'doctor', 'admin'),
  ah(async (req, res) => {
    const id = idParam(req);
    const a = await one('select * from alerts where id = $1', [id]);
    if (!a) throw new HttpError(404, 'Alert not found');
    await assertPatientAccess(req.user!, Number(a.patient_id));
    const p = await patientRow(Number(a.patient_id));
    const uids = await recipientUserIds(Number(a.patient_id), a.target_role);
    const users = uids.length ? await q(`select id, name, phone, language, role from users where id in (${uids.map(Number).join(',')})`) : [];
    const recipients = users.map((u) => {
      const lang = (['en', 'kn', 'hi'].includes(u.language) ? u.language : 'en') as string;
      const text = [`🔔 ${HEADER[lang]} – ${p?.name}${p?.village ? ` (${p.village})` : ''}`, a.message, ACTION[a.type] ?? '', `— ${FOOTER[lang]}`]
        .filter(Boolean)
        .join('\n');
      const digits = String(u.phone).replace(/\D/g, '').slice(-10);
      return {
        name: u.name,
        role: u.role,
        phone: digits,
        language: lang,
        text,
        // Unicode SMS = 70 chars per segment; plain = 160.
        smsParts: Math.ceil(text.length / (/[^\x00-\x7F]/.test(text) ? 67 : 153)),
        whatsappUrl: `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`,
        smsUrl: `sms:+91${digits}?body=${encodeURIComponent(text)}`,
      };
    });
    res.json({ alertId: id, recipients });
  }),
);

