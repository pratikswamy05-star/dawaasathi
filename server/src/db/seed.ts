/**
 * Demo data — DUMMY people only. Runs once, on an empty database, when DEMO_MODE=true.
 * Includes deliberate prescription conflicts, missed doses and low stock so every feature shows something.
 */
import bcrypt from 'bcryptjs';
import { now } from '../clock';
import { config } from '../config';
import { addDays, atLocal, localDate } from '../domain/time';
import { DOSE_SELECT, escalateMissed } from '../services/doses';
import { createPrescription, type RxInput } from '../services/prescriptions';
import { json, one, q } from './index';

const MEDICATIONS: [string, string[], string, 'BP' | 'Diabetes' | 'Cholesterol' | 'Other', string][] = [
  ['Metformin 500', ['metformin'], '500mg', 'Diabetes', 'Take with or after food.'],
  ['Glycomet 500', ['metformin'], '500mg', 'Diabetes', 'Brand of metformin. Take with or after food.'],
  ['Glimepiride 1', ['glimepiride'], '1mg', 'Diabetes', 'Usually taken with breakfast.'],
  ['Sitagliptin 100', ['sitagliptin'], '100mg', 'Diabetes', 'Usually once a day.'],
  ['Telmisartan 40', ['telmisartan'], '40mg', 'BP', 'Once a day at the same time.'],
  ['Amlodipine 5', ['amlodipine'], '5mg', 'BP', 'Once a day at the same time.'],
  ['Telma-AM 40/5', ['telmisartan', 'amlodipine'], '40mg/5mg', 'BP', 'Combination BP tablet.'],
  ['Atenolol 50', ['atenolol'], '50mg', 'BP', 'Do not stop suddenly without asking the doctor.'],
  ['Losartan 50', ['losartan'], '50mg', 'BP', 'Once a day.'],
  ['Hydrochlorothiazide 12.5', ['hydrochlorothiazide'], '12.5mg', 'BP', 'Usually taken in the morning.'],
  ['Atorvastatin 10', ['atorvastatin'], '10mg', 'Cholesterol', 'Usually taken at night.'],
  ['Aspirin 75', ['aspirin'], '75mg', 'Other', 'Take after food.'],
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function user(name: string, phone: string, password: string, role: string, language = 'en') {
  const r = await one('insert into users (name, phone, password_hash, role, language) values ($1, $2, $3, $4, $5) returning id', [
    name,
    phone,
    await bcrypt.hash(password, 10),
    role,
    language,
  ]);
  return Number(r!.id);
}

export async function seedIfEmpty() {
  const c = await one('select count(*)::int as n from users');
  if (Number(c?.n ?? 0) > 0) return;

  for (const [name, ingr, strength, category, instructions] of MEDICATIONS) {
    await q('insert into medications (name, active_ingredients, strength, category, instructions) values ($1, $2::jsonb, $3, $4, $5) on conflict do nothing', [
      name,
      json(ingr),
      strength,
      category,
      instructions,
    ]);
  }

  if (!config.demoMode) {
    console.log('Database is empty. DEMO_MODE=false, so no demo users were created — add an admin user directly in the database.');
    return;
  }
  console.log('Seeding demo data (dummy patients only)…');

  // --- Staff & caregivers ---
  const adminId = await user('System Admin', '9000000001', 'Admin@123', 'admin');
  const docUser1 = await user('Dr. Kavya Rao', '9100000001', 'Doctor@123', 'doctor');
  const docUser2 = await user('Dr. Imran Khan', '9100000002', 'Doctor@123', 'doctor');
  const ashaUser1 = await user('Shobha (ASHA)', '9200000001', 'Asha@123', 'asha', 'kn');
  const ashaUser2 = await user('Latha (ASHA)', '9200000002', 'Asha@123', 'asha', 'kn');
  const cgUser1 = await user('Ravi Kumar', '9300000001', 'Care@123', 'caregiver');
  const cgUser2 = await user('Meena', '9300000002', 'Care@123', 'caregiver', 'kn');
  const cgUser3 = await user('Kiran', '9300000003', 'Care@123', 'caregiver', 'hi');

  const ins = async (sql: string, params: unknown[]) => Number((await one(sql, params))!.id);
  const doc1 = await ins('insert into doctors (user_id, facility, registration_no) values ($1, $2, $3) returning id', [docUser1, 'PHC Gorur', 'KMC-DEMO-1']);
  const doc2 = await ins('insert into doctors (user_id, facility, registration_no) values ($1, $2, $3) returning id', [docUser2, 'CHC Arsikere', 'KMC-DEMO-2']);
  const asha1 = await ins('insert into asha_workers (user_id, area) values ($1, $2) returning id', [ashaUser1, 'Gorur – Belur']);
  const asha2 = await ins('insert into asha_workers (user_id, area) values ($1, $2) returning id', [ashaUser2, 'Arsikere']);
  const cg1 = await ins('insert into caregivers (user_id, relation) values ($1, $2) returning id', [cgUser1, 'Son']);
  const cg2 = await ins('insert into caregivers (user_id, relation) values ($1, $2) returning id', [cgUser2, 'Daughter']);
  const cg3 = await ins('insert into caregivers (user_id, relation) values ($1, $2) returning id', [cgUser3, 'Grandson']);

  // --- Patients ---
  const medId = async (name: string) => Number((await one('select id from medications where name = $1', [name]))!.id);
  const today = localDate(now());
  const start = addDays(today, -30);
  const rx = async (o: Partial<RxInput> & Pick<RxInput, 'medicationId' | 'prescriberName' | 'currentQuantity'>): Promise<RxInput> => ({
    source: 'PHC',
    unitsPerDose: 1,
    foodRule: 'after',
    startDate: start,
    frequency: 'OD',
    dosage: null,
    ...o,
  });

  type P = { name: string; age: number; gender: 'F' | 'M'; village: string; phone: string; lang: string; conditions: string[]; caregiver: number | null; asha: number; doctor: number; adherence: number; rx: RxInput[] };
  const patients: P[] = [
    {
      name: 'Lakshmi', age: 68, gender: 'F', village: 'Gorur', phone: '9400000001', lang: 'kn', conditions: ['BP', 'Diabetes'],
      caregiver: cg1, asha: asha1, doctor: doc1, adherence: 0.82,
      rx: [
        await rx({ medicationId: await medId('Metformin 500'), dosage: '500mg', frequency: 'BD', prescriberName: 'Dr. Kavya Rao (PHC Gorur)', doctorId: doc1, currentQuantity: 10 }),
        await rx({ medicationId: await medId('Glycomet 500'), dosage: '500mg', frequency: 'BD', prescriberName: 'Dr. Suresh (Private clinic, Hassan)', source: 'Private', currentQuantity: 40 }),
        await rx({ medicationId: await medId('Telmisartan 40'), dosage: '40mg', prescriberName: 'Dr. Kavya Rao (PHC Gorur)', doctorId: doc1, currentQuantity: 30 }),
        await rx({ medicationId: await medId('Atorvastatin 10'), dosage: '10mg', frequency: 'HS', foodRule: 'none', prescriberName: 'Dr. Kavya Rao (PHC Gorur)', doctorId: doc1, currentQuantity: 20 }),
      ],
    },
    {
      name: 'Ramesh', age: 72, gender: 'M', village: 'Belur', phone: '9400000002', lang: 'kn', conditions: ['Diabetes'],
      caregiver: cg2, asha: asha1, doctor: doc1, adherence: 0.55,
      rx: [
        await rx({ medicationId: await medId('Glimepiride 1'), dosage: '1mg', foodRule: 'before', times: ['08:30'], prescriberName: 'Health camp, Belur', source: 'Health camp', currentQuantity: 20 }),
        await rx({ medicationId: await medId('Metformin 500'), dosage: '500mg', frequency: 'TDS', prescriberName: 'Dr. Kavya Rao (PHC Gorur)', doctorId: doc1, currentQuantity: 4 }),
      ],
    },
    {
      name: 'Gowramma', age: 65, gender: 'F', village: 'Arsikere', phone: '9400000003', lang: 'kn', conditions: ['BP'],
      caregiver: cg3, asha: asha2, doctor: doc2, adherence: 0.8,
      rx: [
        await rx({ medicationId: await medId('Amlodipine 5'), dosage: '5mg', foodRule: 'none', prescriberName: 'Dr. Imran Khan (CHC Arsikere)', doctorId: doc2, currentQuantity: 40 }),
        await rx({ medicationId: await medId('Telma-AM 40/5'), dosage: '40mg', prescriberName: 'Dr. Prakash (Private, Hassan)', source: 'Private', currentQuantity: 25 }),
        await rx({ medicationId: await medId('Hydrochlorothiazide 12.5'), dosage: '12.5mg', prescriberName: 'Dr. Imran Khan (CHC Arsikere)', doctorId: doc2, currentQuantity: 6 }),
      ],
    },
    {
      name: 'Shivanna', age: 70, gender: 'M', village: 'Channarayapatna', phone: '9400000004', lang: 'en', conditions: ['BP', 'Diabetes'],
      caregiver: null, asha: asha2, doctor: doc2, adherence: 0.68,
      rx: [
        await rx({ medicationId: await medId('Atenolol 50'), dosage: '50mg', foodRule: 'before', times: ['08:00'], prescriberName: 'Dr. Imran Khan (CHC Arsikere)', doctorId: doc2, currentQuantity: 30 }),
        await rx({ medicationId: await medId('Metformin 500'), dosage: '500mg', foodRule: 'after', times: ['08:00', '20:00'], prescriberName: 'Dr. Imran Khan (CHC Arsikere)', doctorId: doc2, currentQuantity: 50 }),
        await rx({ medicationId: await medId('Sitagliptin 100'), dosage: null, prescriberName: 'Health camp, Channarayapatna', source: 'Health camp', currentQuantity: 20 }),
      ],
    },
    {
      name: 'Puttamma', age: 66, gender: 'F', village: 'Holenarasipura', phone: '9400000005', lang: 'kn', conditions: ['Diabetes', 'BP'],
      caregiver: null, asha: asha1, doctor: doc1, adherence: 0.96,
      rx: [
        await rx({ medicationId: await medId('Metformin 500'), dosage: '500mg', frequency: 'BD', prescriberName: 'Dr. Kavya Rao (PHC Gorur)', doctorId: doc1, currentQuantity: 60 }),
        await rx({ medicationId: await medId('Losartan 50'), dosage: '50mg', foodRule: 'none', prescriberName: 'Dr. Kavya Rao (PHC Gorur)', doctorId: doc1, currentQuantity: 45 }),
      ],
    },
  ];

  const rand = mulberry32(7);
  const nowDate = now();

  for (const p of patients) {
    const userId = await user(p.name, p.phone, 'Patient@123', 'patient', p.lang);
    const pid = await ins(
      `insert into patients (user_id, name, age, gender, village, phone, conditions, caregiver_id, asha_id, doctor_id)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10) returning id`,
      [userId, p.name, p.age, p.gender, p.village, p.phone, json(p.conditions), p.caregiver, p.asha, p.doctor],
    );
    for (const r of p.rx) await createPrescription(pid, r, adminId);

    // 14 days of history from the real schedules
    const schedules = await q('select id, prescription_id, time_of_day from medication_schedules where patient_id = $1 and active', [pid]);
    for (let day = 14; day >= 1; day--) {
      const date = addDays(today, -day);
      for (const s of schedules) {
        const at = atLocal(date, s.time_of_day);
        const taken = rand() < p.adherence;
        await q(
          `insert into dose_logs (patient_id, prescription_id, schedule_id, scheduled_at, status, confirmed_at, method, reminder_count, escalation_level)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict do nothing`,
          [
            pid,
            s.prescription_id,
            s.id,
            at.toISOString(),
            taken ? 'taken' : 'missed',
            taken ? new Date(at.getTime() + Math.floor(rand() * 25) * 60000).toISOString() : null,
            taken ? 'button' : 'auto',
            taken ? 1 : 3,
            taken ? 0 : 3,
          ],
        );
      }
    }

    // Today: doses already past are marked taken (no alert flood on first start)…
    const past = await q(`${DOSE_SELECT} where d.patient_id = $1 and d.status = 'pending' and d.scheduled_at <= $2 order by d.scheduled_at`, [
      pid,
      nowDate.toISOString(),
    ]);
    for (const [i, d] of past.entries()) {
      // …except Ramesh's first dose today, which is missed so the caregiver/ASHA alerts are visible right away.
      if (p.name === 'Ramesh' && i === 0) {
        await q(`update dose_logs set status = 'missed', method = 'auto', reminder_count = 3, escalation_level = 3 where id = $1`, [d.id]);
        await escalateMissed(d as never);
        continue;
      }
      await q(`update dose_logs set status = 'taken', method = 'button', confirmed_at = $2, reminder_count = 1 where id = $1`, [d.id, nowDate.toISOString()]);
    }

    // A little refill history
    const firstRx = await one('select id from prescriptions where patient_id = $1 order by id limit 1', [pid]);
    await q(`insert into refills (prescription_id, patient_id, quantity_added, note, recorded_by, refilled_at) values ($1, $2, 30, 'PHC pharmacy', $3, $4)`, [
      firstRx!.id,
      pid,
      p.asha === asha1 ? ashaUser1 : ashaUser2,
      atLocal(addDays(today, -20), '11:00').toISOString(),
    ]);
  }

  await q(`insert into audit_logs (user_id, action, entity, details) values ($1, 'seed', 'system', $2::jsonb)`, [adminId, json({ patients: patients.length })]);
  console.log('Demo data ready. See README for login details.');
}
