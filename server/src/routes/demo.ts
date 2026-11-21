import { Router } from 'express';
import { advanceClock, clockOffsetMinutes, now, resetClock } from '../clock';
import { config } from '../config';
import { ah, HttpError, parse } from '../http';
import { requireAuth } from '../middleware/auth';
import { tickOnce } from '../jobs/scheduler';
import { audit } from '../services/audit';
import { demoAdvanceSchema } from '../validation';

export const healthRouter = Router();
export const demoRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    ok: true,
    demoMode: config.demoMode,
    serverTime: now().toISOString(),
    clockOffsetMinutes: clockOffsetMinutes(),
    escalation: config.escalation,
  });
});

/** Demo-only: move the server clock forward so escalation can be shown live. Disabled when DEMO_MODE=false. */
demoRouter.use((_req, _res, next) => (config.demoMode ? next() : next(new HttpError(404, 'Not found'))));
demoRouter.use(requireAuth);

demoRouter.post(
  '/advance',
  ah(async (req, res) => {
    const { minutes } = parse(demoAdvanceSchema, req.body);
    advanceClock(minutes);
    await tickOnce();
    await audit(req, 'demo_clock_advance', 'clock', null, { minutes });
    res.json({ serverTime: now().toISOString(), clockOffsetMinutes: clockOffsetMinutes() });
  }),
);

demoRouter.post(
  '/reset-clock',
  ah(async (req, res) => {
    resetClock();
    await audit(req, 'demo_clock_reset', 'clock');
    res.json({ serverTime: now().toISOString(), clockOffsetMinutes: 0 });
  }),
);
