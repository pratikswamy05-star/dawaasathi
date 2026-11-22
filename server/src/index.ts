import { config } from './config'; // must be first: loads .env and sets the time zone
import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import helmet from 'helmet';
import { initDb } from './db';
import { seedIfEmpty } from './db/seed';
import { seedFeatures } from './db/seedFeatures';
import { errorHandler } from './http';
import { startScheduler } from './jobs/scheduler';
import { requireAuth } from './middleware/auth';
import { adminRouter, medicationsRouter, staffRouter } from './routes/admin';
import { alertsRouter, notificationsRouter } from './routes/alerts';
import { authRouter } from './routes/auth';
import { chatRouter } from './routes/chat';
import { dashboardRouter } from './routes/dashboard';
import { demoRouter, healthRouter } from './routes/demo';
import { dosesRouter } from './routes/doses';
import { remindersRouter, voiceRouter } from './routes/reminders';
import { assistantRouter } from './routes/assistant';
import { emergencyRouter, visitsRouter } from './routes/care';
import { alertMessageRouter, pharmacyRouter, reportRouter, scanRouter, teleconsultRouter, vitalsRouter } from './routes/features';
import { patientsRouter } from './routes/patients';
import { prescriptionsRouter } from './routes/prescriptions';

async function main() {
  const kind = await initDb();
  await seedIfEmpty();
  await seedFeatures();

  const app = express();
  app.set('trust proxy', 1);
  // Security headers. The policy allows what the web app needs: inline styles, recorded audio (data:/blob:),
  // the free OCR library from jsDelivr (pill scan) and the speech voices; everything else stays same-origin.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://cdn.jsdelivr.net', "'wasm-unsafe-eval'"],
          workerSrc: ["'self'", 'blob:'],
          connectSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://tessdata.projectnaptha.com', 'blob:', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          mediaSrc: ["'self'", 'data:', 'blob:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(cors({ origin: config.clientOrigin, credentials: false }));
  // Voice recordings need a bigger body (≈30 s of audio); everything else stays small.
  const smallJson = express.json({ limit: '100kb' });
  const voiceJson = express.json({ limit: '1.5mb' });
  app.use((req, res, next) => (/^\/api\/patients\/\d+\/reminders\/voice$/.test(req.path) ? voiceJson : smallJson)(req, res, next));

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/demo', demoRouter);

  // Everything below requires a valid login.
  app.use('/api', requireAuth);
  app.use('/api/patients/:id/vitals', vitalsRouter);
  app.use('/api/patients/:id/reminders', remindersRouter);
  app.use('/api/patients/:id/emergency-card', emergencyRouter);
  app.use('/api/patients/:id/weekly-report', reportRouter);
  app.use('/api/patients', patientsRouter);
  app.use('/api/prescriptions', prescriptionsRouter);
  app.use('/api/doses', dosesRouter);
  app.use('/api/alerts', alertMessageRouter);
  app.use('/api/alerts', alertsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/medications', medicationsRouter);
  app.use('/api/staff', staffRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/teleconsults', teleconsultRouter);
  app.use('/api/scan', scanRouter);
  app.use('/api/pharmacies', pharmacyRouter);
  app.use('/api/voice-reminders', voiceRouter);
  app.use('/api/assistant', assistantRouter);
  app.use('/api/visits', visitsRouter);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);

  // Production: serve the built web app (client/dist) from the same server, so one URL hosts everything.
  const dist = path.resolve(process.cwd(), '../client/dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
    console.log(`  Serving web app from ${dist}`);
  }

  app.listen(config.port, () => {
    console.log(`\n  DawaaSathi API  →  http://localhost:${config.port}/api/health`);
    if (fs.existsSync(path.join(dist, 'index.html'))) console.log(`  Web app          →  http://localhost:${config.port}/`);
    console.log(`  Database: ${kind === 'pglite' ? `embedded PostgreSQL (${config.pgliteDir})` : 'PostgreSQL (DATABASE_URL)'}`);
    console.log(`  Demo mode: ${config.demoMode ? 'ON' : 'off'}   Time zone: ${process.env.TZ}\n`);
  });

  startScheduler();
}

main().catch((e) => {
  console.error('Failed to start server:', e);
  process.exit(1);
});
