import { z } from 'zod';

const phone = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number');
const password = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72)
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/\d/, 'Include a number');
const name = z.string().trim().min(2, 'Name is too short').max(80);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');
const language = z.enum(['en', 'kn', 'hi']);
const conditions = z.array(z.enum(['BP', 'Diabetes', 'Heart', 'Other'])).max(4).default([]);

/** portal = which login screen was used. The server refuses accounts that belong to a different portal. */
export const PORTALS = ['patient', 'caregiver', 'asha', 'staff'] as const;
export const loginSchema = z.object({
  phone,
  password: z.string().min(1, 'Enter your password').max(72),
  portal: z.enum(PORTALS).optional(),
});

export const registerSchema = z
  .object({
    name,
    phone,
    password,
    role: z.enum(['patient', 'caregiver']),
    language: language.default('en'),
    age: z.coerce.number().int().min(18).max(120).optional(),
    village: z.string().trim().max(80).optional(),
    conditions,
    relation: z.string().trim().max(40).optional(),
  })
  .strict();

export const updateMeSchema = z.object({ language }).strict();

export const patientCreateSchema = z
  .object({
    name,
    age: z.coerce.number().int().min(0).max(120),
    gender: z.enum(['F', 'M', 'O']),
    village: z.string().trim().min(2).max(80),
    phone: phone.optional().or(z.literal('')),
    conditions,
    caregiverId: z.coerce.number().int().positive().nullable().optional(),
    ashaId: z.coerce.number().int().positive().nullable().optional(),
    doctorId: z.coerce.number().int().positive().nullable().optional(),
  })
  .strict();

export const patientUpdateSchema = patientCreateSchema.partial().strict();

export const prescriptionSchema = z
  .object({
    medicationId: z.coerce.number().int().positive('Choose a medicine'),
    prescriberName: z.string().trim().min(2, 'Who prescribed it?').max(80),
    source: z.enum(['PHC', 'Health camp', 'Private', 'Hospital']),
    dosage: z
      .string()
      .trim()
      .max(20)
      .regex(/^$|^\d+(\.\d+)?\s?(mg|mcg|g|ml|iu|units?)$/i, 'Write dosage like 500mg')
      .optional()
      .nullable(),
    unitsPerDose: z.coerce.number().int().min(1).max(10).default(1),
    frequency: z.enum(['OD', 'BD', 'TDS', 'QID', 'HS']).nullable().optional(),
    times: z.array(hhmm).max(6).default([]),
    foodRule: z.enum(['before', 'after', 'with', 'none']),
    startDate: isoDate,
    endDate: isoDate.nullable().optional().or(z.literal('')),
    currentQuantity: z.coerce.number().int().min(0).max(1000),
    instructions: z.string().trim().max(300).nullable().optional(),
  })
  .strict()
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: 'End date must be after start date', path: ['endDate'] });

export const prescriptionUpdateSchema = z
  .object({
    dosage: z.string().trim().max(20).nullable().optional(),
    unitsPerDose: z.coerce.number().int().min(1).max(10).optional(),
    frequency: z.enum(['OD', 'BD', 'TDS', 'QID', 'HS']).nullable().optional(),
    times: z.array(hhmm).max(6).optional(),
    foodRule: z.enum(['before', 'after', 'with', 'none']).optional(),
    endDate: isoDate.nullable().optional(),
    instructions: z.string().trim().max(300).nullable().optional(),
  })
  .strict();

export const checkSchema = z.object({ patientId: z.coerce.number().int().positive(), draft: z.unknown() }).strict();

export const refillSchema = z
  .object({ quantity: z.coerce.number().int().min(1).max(1000), note: z.string().trim().max(200).optional() })
  .strict();

export const confirmSchema = z
  .object({
    status: z.enum(['taken', 'missed']),
    method: z.enum(['button', 'voice', 'caregiver', 'asha']).default('button'),
    confirmedAt: z.string().datetime().optional(),
    clientId: z.string().max(64).optional(),
  })
  .strict();

export const syncSchema = z
  .object({ items: z.array(confirmSchema.extend({ doseId: z.coerce.number().int().positive() })).max(200) })
  .strict();

export const adminUserSchema = z
  .object({
    name,
    phone,
    password,
    role: z.enum(['patient', 'caregiver', 'asha', 'doctor', 'admin']),
    language: language.default('en'),
    email: z.string().email().optional().or(z.literal('')),
    facility: z.string().trim().max(80).optional(),
    area: z.string().trim().max(80).optional(),
    relation: z.string().trim().max(40).optional(),
  })
  .strict();

export const adminUserUpdateSchema = z.object({ active: z.boolean().optional(), name: name.optional() }).strict();

export const demoAdvanceSchema = z.object({ minutes: z.coerce.number().int().min(1).max(24 * 60) }).strict();

// ===== v4 features =====
export const VITAL_KINDS = ['bp', 'sugar_fasting', 'sugar_random', 'pulse', 'temperature', 'weight'] as const;

export const vitalSchema = z
  .object({
    kind: z.enum(VITAL_KINDS),
    value1: z.coerce.number().finite(),
    value2: z.coerce.number().finite().nullish(),
    note: z.string().trim().max(300).optional().default(''),
    measuredAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((v) => v.kind !== 'bp' || v.value2 != null, { message: 'Enter both numbers for blood pressure (e.g. 130 / 85)', path: ['value2'] });

export const teleconsultCreateSchema = z
  .object({
    patientId: z.coerce.number().int().positive().optional(),
    reason: z.string().trim().min(3, 'Tell the doctor briefly why').max(500),
    preferredAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export const teleconsultUpdateSchema = z
  .object({
    status: z.enum(['confirmed', 'completed', 'cancelled']),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
    doctorNote: z.string().trim().max(1000).optional(),
  })
  .strict();

export const pillMatchSchema = z
  .object({
    text: z.string().max(5000),
    patientId: z.coerce.number().int().positive().optional(),
  })
  .strict();

export const REMINDER_LANGS = ['en', 'kn', 'hi', 'ta', 'te', 'mr'] as const;

export const reminderLanguagesSchema = z
  .object({
    languages: z
      .array(z.enum(REMINDER_LANGS))
      .min(1, 'Choose at least one language')
      .max(3, 'Choose up to 3 languages')
      .refine((a) => new Set(a).size === a.length, 'Each language only once'),
  })
  .strict();

export const voiceReminderSchema = z
  .object({
    prescriptionId: z.coerce.number().int().positive().nullish(),
    language: z.enum(REMINDER_LANGS).optional(),
    audio: z
      .string()
      .min(100, 'The recording is empty')
      .max(1_400_000, 'Recording is too long — keep it under 30 seconds')
      .regex(/^[A-Za-z0-9+/=]+$/, 'Invalid audio data'),
    mime: z.string().regex(/^audio\/[a-z0-9.+-]+(;\s*codecs=[a-z0-9.,"-]+)?$/i, 'Unsupported audio format'),
    durationSec: z.coerce.number().int().min(1).max(60),
  })
  .strict();

export const reminderTimesSchema = z
  .object({
    times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, e.g. 08:30')).min(1).max(6),
  })
  .strict();
