/**
 * Demo data for the v4 features (vitals, teleconsults, pharmacies, generic prices).
 * Safe to run on every start: each block only fills what is missing.
 * ALL pharmacy names, coordinates and prices are SAMPLE data for the prototype.
 */
import crypto from 'node:crypto';
import { now } from '../clock';
import { config } from '../config';
import { addDays, atLocal, localDate } from '../domain/time';
import { classifyVital, type VitalKind } from '../domain/vitals';
import { one, q } from './index';

// [medicine name, generic name, sample brand price per 10, sample generic (Jan Aushadhi) price per 10] — demo figures only.
const PRICES: [string, string, number, number][] = [
  ['Metformin 500', 'Metformin 500 mg', 20, 8],
  ['Glycomet 500', 'Metformin 500 mg', 24, 8],
  ['Glimepiride 1', 'Glimepiride 1 mg', 60, 14],
  ['Sitagliptin 100', 'Sitagliptin 100 mg', 180, 60],
  ['Telmisartan 40', 'Telmisartan 40 mg', 90, 18],
  ['Amlodipine 5', 'Amlodipine 5 mg', 30, 6],
  ['Telma-AM 40/5', 'Telmisartan 40 + Amlodipine 5', 120, 28],
  ['Atenolol 50', 'Atenolol 50 mg', 25, 7],
  ['Losartan 50', 'Losartan 50 mg', 60, 13],
  ['Hydrochlorothiazide 12.5', 'Hydrochlorothiazide 12.5 mg', 20, 6],
  ['Atorvastatin 10', 'Atorvastatin 10 mg', 90, 15],
  ['Aspirin 75', 'Aspirin 75 mg', 12, 4],
];

// Sample pharmacies around Hassan district (approximate town coordinates).
const PHARMACIES: [string, 'jan_aushadhi' | 'phc' | 'private', string, string, string, number, number][] = [
  ['Jan Aushadhi Kendra – Hassan (demo)', 'jan_aushadhi', 'Hassan', 'Near District Hospital, Hassan', '9 am – 9 pm', 13.0068, 76.0996],
  ['Jan Aushadhi Kendra – Belur (demo)', 'jan_aushadhi', 'Belur', 'Main Road, Belur', '9 am – 8 pm', 13.1656, 75.8656],
  ['Jan Aushadhi Kendra – Arsikere (demo)', 'jan_aushadhi', 'Arsikere', 'Bus stand road, Arsikere', '9 am – 8 pm', 13.3141, 76.2569],
  ['Jan Aushadhi Kendra – Channarayapatna (demo)', 'jan_aushadhi', 'Channarayapatna', 'BM Road, Channarayapatna', '9 am – 8 pm', 12.9025, 76.3881],
  ['PHC Gorur – free medicines (demo)', 'phc', 'Gorur', 'Primary Health Centre, Gorur', '9 am – 4:30 pm', 12.8264, 76.0598],
  ['PHC Holenarasipura – free medicines (demo)', 'phc', 'Holenarasipura', 'Taluk Hospital, Holenarasipura', '9 am – 4:30 pm', 12.7853, 76.2436],
  ['CHC Arsikere – free medicines (demo)', 'phc', 'Arsikere', 'Community Health Centre, Arsikere', '9 am – 4:30 pm', 13.3168, 76.2611],
  ['Sri Ganesh Medicals (demo)', 'private', 'Hassan', 'BM Road, Hassan', '8 am – 10 pm', 13.0039, 76.1023],
];

export async function seedFeatures() {
  for (const [name, generic, brand, gen] of PRICES)
    await q('update medications set generic_name = $2, brand_price = $3, generic_price = $4 where name = $1 and generic_price is null', [name, generic, brand, gen]);

  for (const [name, kind, area, address, hours, lat, lng] of PHARMACIES)
    await q(
      `insert into pharmacies (name, kind, area, address, open_hours, lat, lng) values ($1, $2, $3, $4, $5, $6, $7) on conflict (name) do nothing`,
      [name, kind, area, address, hours, lat, lng],
    );

  if (!config.demoMode) return;
  const patients = await q('select p.id, p.name, p.user_id, p.asha_id, a.user_id as asha_user from patients p left join asha_workers a on a.id = p.asha_id order by p.id');
  if (!patients.length) return;
  const byName = (n: string) => patients.find((p) => p.name === n);
  const t = localDate(now());

  // Demo reminder languages (spoken in this order). Only fills patients that have none yet.
  for (const [name, langs] of [
    ['Lakshmi', ['kn', 'en']],
    ['Ramesh', ['kn']],
    ['Gowramma', ['kn', 'hi']],
    ['Shivanna', ['en', 'kn']],
    ['Puttamma', ['kn']],
  ] as const)
    await q(`update patients set reminder_languages = $2::jsonb where name = $1 and reminder_languages = '[]'::jsonb`, [name, JSON.stringify(langs)]);

  const vCount = await one('select count(*)::int as n from vitals');
  if (Number(vCount?.n ?? 0) === 0) {
    // [patient, kind, value pairs from oldest to newest, every N days, time of day]
    const plan: [string, VitalKind, [number, number | null][], string][] = [
      ['Lakshmi', 'bp', [[138, 86], [142, 88], [136, 84], [146, 92], [140, 90], [134, 84], [144, 90]], '08:00'],
      ['Lakshmi', 'sugar_fasting', [[132, null], [128, null], [141, null], [126, null], [118, null], [135, null], [129, null]], '07:30'],
      ['Lakshmi', 'weight', [[62, null], [62.4, null], [61.8, null]], '08:15'],
      ['Ramesh', 'sugar_random', [[188, null], [205, null], [196, null], [228, null], [242, null], [236, null], [262, null]], '13:30'],
      ['Ramesh', 'bp', [[128, 80], [132, 82], [126, 78]], '09:00'],
      ['Gowramma', 'bp', [[150, 94], [146, 92], [152, 96], [148, 92], [142, 90]], '08:30'],
      ['Gowramma', 'pulse', [[78, null], [82, null], [76, null]], '08:30'],
      ['Shivanna', 'bp', [[136, 86], [140, 88], [132, 84]], '09:00'],
      ['Shivanna', 'sugar_fasting', [[112, null], [118, null], [109, null]], '07:30'],
      ['Puttamma', 'bp', [[122, 78], [118, 76], [124, 80], [120, 78]], '08:00'],
      ['Puttamma', 'sugar_fasting', [[98, null], [96, null], [102, null], [94, null]], '07:30'],
    ];
    for (const [pname, kind, values, time] of plan) {
      const p = byName(pname);
      if (!p) continue;
      const step = values.length > 4 ? 2 : 4;
      for (const [i, [v1, v2]] of values.entries()) {
        const daysAgo = (values.length - 1 - i) * step + 1;
        const level = classifyVital(kind, v1, v2).level;
        const by = i % 2 === 0 ? p.user_id : (p.asha_user ?? p.user_id);
        await q(`insert into vitals (patient_id, kind, value1, value2, level, recorded_by, measured_at) values ($1, $2, $3, $4, $5, $6, $7)`, [
          p.id,
          kind,
          v1,
          v2,
          level,
          by,
          atLocal(addDays(t, -daysAgo), time).toISOString(),
        ]);
      }
    }
  }

  const tcCount = await one('select count(*)::int as n from teleconsults');
  if (Number(tcCount?.n ?? 0) === 0) {
    const ramesh = byName('Ramesh');
    const lakshmi = byName('Lakshmi');
    if (ramesh) {
      const d = await one('select doctor_id from patients where id = $1', [ramesh.id]);
      await q(`insert into teleconsults (patient_id, doctor_id, requested_by, reason, preferred_at) values ($1, $2, $3, $4, $5)`, [
        ramesh.id,
        d?.doctor_id ?? null,
        ramesh.asha_user,
        'Sugar readings after food are above 200 for a week and some doses were missed. Please review.',
        atLocal(addDays(t, 1), '11:00').toISOString(),
      ]);
    }
    if (lakshmi) {
      const d = await one('select doctor_id from patients where id = $1', [lakshmi.id]);
      await q(`insert into teleconsults (patient_id, doctor_id, requested_by, reason, scheduled_at, status, room) values ($1, $2, $3, $4, $5, 'confirmed', $6)`, [
        lakshmi.id,
        d?.doctor_id ?? null,
        lakshmi.user_id,
        'Two diabetes medicines from different doctors (Metformin and Glycomet). Want to confirm which to take.',
        atLocal(addDays(t, 1), '16:00').toISOString(),
        `DawaaSathi-${crypto.randomBytes(6).toString('hex')}`,
      ]);
    }
  }
}
