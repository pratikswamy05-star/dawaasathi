import 'dotenv/config';

// All "today" calculations use Indian time unless overridden.
process.env.TZ = process.env.TZ || 'Asia/Kolkata';

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : fallback;
};

const demoMode = (process.env.DEMO_MODE ?? 'true').toLowerCase() === 'true';

if (!process.env.JWT_SECRET && !demoMode) {
  throw new Error('JWT_SECRET must be set when DEMO_MODE is false. See server/.env.example');
}

export const config = {
  port: num(process.env.PORT, 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'demo-only-secret-change-me-in-production',
  databaseUrl: process.env.DATABASE_URL || '',
  pgliteDir: process.env.PGLITE_DIR || './data/pglite',
  demoMode,
  escalation: {
    reminder1Min: num(process.env.REMINDER_1_MIN, 10),
    reminder2Min: num(process.env.REMINDER_2_MIN, 20),
    caregiverMin: num(process.env.CAREGIVER_ALERT_MIN, 45),
    repeatThreshold: num(process.env.REPEAT_MISS_THRESHOLD, 3),
    repeatWindowDays: num(process.env.REPEAT_MISS_WINDOW_DAYS, 7),
  },
  /** Optional: set ANTHROPIC_API_KEY in server/.env to let the voice assistant answer free questions with Claude. */
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.AI_MODEL || 'claude-haiku-5-5',
  },
  refill: {
    soonDays: num(process.env.REFILL_SOON_DAYS, 7),
    criticalDays: num(process.env.REFILL_CRITICAL_DAYS, 3),
    bufferDays: num(process.env.REFILL_BUFFER_DAYS, 2),
  },
  /**
   * WhatsApp alert to the caregiver when MORE THAN 2 doses are missed within the window.
   * Real sending needs a Twilio WhatsApp account (server-side keys only). Without keys the
   * app runs in demo mode: the message is saved and the caregiver gets a one-tap WhatsApp link.
   */
  whatsapp: {
    missThreshold: num(process.env.WHATSAPP_MISS_THRESHOLD, 3),
    windowHours: num(process.env.WHATSAPP_MISS_WINDOW_HOURS, 48),
    twilioSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioToken: process.env.TWILIO_AUTH_TOKEN || '',
    twilioFrom: process.env.TWILIO_WHATSAPP_FROM || '', // e.g. whatsapp:+14155238886
  },
};
