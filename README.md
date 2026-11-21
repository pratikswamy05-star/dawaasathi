# DawaaSathi — Medication Management for Rural Elders

A full-stack web app that helps rural elderly patients with **hypertension and diabetes** take the right medicine at the right time. It connects **Patient → Caregiver → ASHA worker → Doctor**, with an **Admin** over all of them.

Core workflow (**Dose Guardian**):

```
Prescription → Rule-based conflict check → Daily schedule → Dose due
  → Voice + visual reminder → Patient confirms (TAKEN / MISSED, button or voice)
  → not confirmed: reminder → 2nd reminder → caregiver alert → ASHA alert on repeated misses → doctor visibility
```

**New in v8:** 🎙️ **Saathi voice assistant** — a floating mic on every patient screen. Speak in English, Kannada or Hindi: *"I took my medicine"* (marks only doses that are due), *"my BP is 140 over 90"* (saves the reading, alerts family/ASHA/doctor if high), *"call my son"*, *"help"* (asks to confirm), *"open reminders"*, or any medicine question. Works without any API key; optionally set `ANTHROPIC_API_KEY` in `server/.env` for AI answers to free questions (key stays on the server).

**New in v7:** ✨ redesigned, animated interface (gradient hero cards, progress rings, count-up numbers, page transitions, skeleton loading — respects *reduce motion*) and reliable multi-language speech: the app waits for the browser's voices, prefers natural voices, shows on-screen subtitles and a per-language **voice check**, and tells you when a language has no voice instead of staying silent.

**New in v6:** 🌐 **reminder languages** — each patient (or their caregiver / ASHA / doctor) picks up to 3 languages from English, ಕನ್ನಡ, हिंदी, தமிழ், తెలుగు, मराठी. The reminder call reads the medicine in each one, in that order, and plays the voice recording made in the patient's first language.

**New in v5:** 📞 **voice reminder calls** — at medicine time the patient's app rings like a phone call and plays a voice message recorded by the son / daughter, ASHA worker or doctor, then reads the medicine aloud. Caregivers, ASHA workers and doctors can also move reminder times (never the number of doses).

**New in v4:** ❤️ health readings (BP / sugar / pulse / temperature / weight) with warning colours and trend charts · 📱 SMS / WhatsApp alert previews · 📹 doctor video-call booking (Jitsi) · 📄 weekly report as PDF · 📷 medicine-strip photo scan (OCR) · 💊 Jan Aushadhi finder with generic-price savings.

The system **never diagnoses, never prescribes and never changes or doubles a dose**. It only flags possible problems and tells people to check with a doctor or pharmacist.

---

## Put it online (public link)

The server also serves the built web app, so **one free Render web service hosts everything**.

1. Push this folder to a GitHub repository (it already has a `.gitignore`).
2. On [render.com](https://render.com) → **New → Blueprint** → choose the repository → **Apply**. `render.yaml` sets everything (build `npm install && npm run build`, start `npm start`, health check `/api/health`, a random `JWT_SECRET`, demo mode on).
3. After the build (~5–8 min) open `https://dawaasathi-xxxx.onrender.com`.

Notes: the free plan sleeps after 15 minutes without visitors (the first visit then takes about a minute). Without `DATABASE_URL` the embedded database resets on every restart and is re-seeded with the demo data — fine for a demo; set `DATABASE_URL` to a free Supabase / Neon PostgreSQL to keep data. HTTPS is automatic, so microphone features work on phones.

## 1. Quick start (beginner friendly)

You need **Node.js 20 or newer** (download the LTS version from nodejs.org). No database install is needed.

```bash
# in the project folder (the one containing this README)
npm install        # installs root, server and client packages (takes a few minutes)
npm run dev        # starts the API (port 4000) and the web app (port 5173) together
```

Open **http://localhost:5173**. To use it on a phone, connect the phone to the same Wi-Fi and open the "Network" address that the client prints, e.g. `http://192.168.1.5:5173`.

On first start the server creates an **embedded PostgreSQL database** (PGlite) in `server/data/pglite` and fills it with demo data. To start over with fresh demo data:

```bash
npm run db:reset   # deletes the embedded demo database; next "npm run dev" re-seeds it
```

---

## 2. Demo login credentials (dummy data only)

| Role | Name | Mobile | Password |
|---|---|---|---|
| Patient | Lakshmi (68, BP + Diabetes, Kannada) | 9400000001 | Patient@123 |
| Patient | Ramesh (72, Diabetes — **high risk**) | 9400000002 | Patient@123 |
| Patient | Gowramma / Shivanna / Puttamma | 9400000003 / 4 / 5 | Patient@123 |
| Caregiver | Ravi (Lakshmi's son) | 9300000001 | Care@123 |
| Caregiver | Meena (Ramesh's daughter) / Kiran | 9300000002 / 3 | Care@123 |
| ASHA worker | Shobha (Lakshmi, Ramesh, Puttamma) | 9200000001 | Asha@123 |
| ASHA worker | Latha (Gowramma, Shivanna) | 9200000002 | Asha@123 |
| Doctor | Dr. Kavya Rao, PHC Gorur | 9100000001 | Doctor@123 |
| Doctor | Dr. Imran Khan, CHC Arsikere | 9100000002 | Doctor@123 |
| Admin | System Admin | 9000000001 | Admin@123 |

### Separate login screens
`/login` asks **"Who is logging in?"** and leads to a dedicated screen for each group:

| Screen | URL | Who | Design |
|---|---|---|---|
| Patient login | `/login/patient` | Patients | Extra-large text and buttons, 🔊 spoken instructions, show-password, self-registration |
| Caregiver login | `/login/caregiver` | Family caregivers | Large, voice-guided, self-registration |
| ASHA worker login | `/login/asha` | ASHA workers | Accounts created by the admin |
| Doctor / Admin login | `/login/staff` | Doctors and admins | Accounts created by the admin |

The **server enforces it**: each screen sends its `portal`, and an account from another group is refused with a link to its correct screen (logged as `login_wrong_portal`). A wrong password always gives the same generic message, so the screens don't reveal which numbers are registered. Logging out returns you to your own login screen. Each screen has one-tap demo account buttons.

**What the demo data contains:**
- **Lakshmi:** Metformin (PHC) **and** Glycomet (private doctor), so the same active ingredient comes from different prescribers. Metformin stock is about 5 days ("refill soon").
- **Ramesh:** a before-food medicine scheduled after breakfast, and a before/after-food clash at 8:30 AM. Metformin may run out in 1 day. Adherence is low, with a missed dose today, so caregiver and ASHA alerts are already showing.
- **Gowramma:** Amlodipine plus Telma-AM, which contains amlodipine (duplicate ingredient).
- **Shivanna:** Sitagliptin with **missing dosage**, and before/after-food medicines both at 8:00 AM.
- **Puttamma:** a clean record with a safety score of 100.

---

## 3. Five-minute demo script

1. **Patient** (Lakshmi): Kannada UI, "Good morning", *4 / 6 doses completed*, the big **Next medicine** card. Tap **🔊 Hear reminder** (*"ಈಗ ನಿಮ್ಮ ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯ…"*), then **TAKEN**. Show the stock and refill warnings and the red **HELP** button.
2. **Escalation live:** open the **🎭 Demo** button (bottom-left) and tap **+3h** until a dose is due, then **+10m** twice and **+30m**. The patient gets reminders. Log in as **Ravi** (caregiver) and a *Missed dose* alert is waiting. Shobha (ASHA) sees *Repeated missed doses* for Ramesh.
3. **ASHA** (Shobha): cards for total, at risk, missed today, refill warnings and follow-up. The patient table is sorted by risk, with filters for High risk, Missed, Refill, BP and Diabetes.
4. **Doctor** (Dr. Kavya): prescription conflicts and safety alerts. Open Ramesh and look at the **Medication Safety Score** and *why* it is 31/100. Go to Prescriptions, try adding **Glycomet** for Lakshmi, and see the warning *before* saving. Open Reports to see the printable follow-up report.
5. **Offline:** in the browser, DevTools → Network → **Offline**. The banner reads *"Offline mode — your reminders will continue working."* Tap TAKEN, switch back online, and the update syncs.
6. **Ask DawaaSathi (chatbot):** as Lakshmi, open **Ask** and tap *"When is my next medicine?"*, *"How many tablets are left?"*, then type *"what is glycomet for"*. Try *"I missed a dose, should I take double?"* (it says no extra dose), *"Do I have kidney disease?"* (it refuses to diagnose), and *"chest pain"* (108 button). Tap 🎤 to ask by voice in Kannada.
7. **Admin:** user management (create or deactivate users), system stats and audit logs.

**v4 features (3 more minutes):**

8. **Health readings:** as Lakshmi tap **❤️ Health readings** → enter BP **190 / 125** → the card turns 🚨 *Contact doctor today*, it is read aloud, and the caregiver, ASHA and doctor are alerted. The trend chart shows the dashed "usual range" line. (Colours only — it never names a disease.)
9. **SMS / WhatsApp preview:** log in as Ravi (caregiver) → on any alert tap **SMS / WhatsApp** → a phone-style preview of the message in the recipient's language (Shobha's is in Kannada) with buttons that open WhatsApp / SMS with the text ready.
10. **Doctor video call:** Lakshmi → **📹 Doctor call** → *Join video call* (already booked for tomorrow). As Shobha (ASHA) request a call for Ramesh. As Dr. Kavya → **Video calls** → pick a time → **Confirm call** → everyone is notified and gets the Jitsi link.
11. **Weekly report:** Lakshmi → **📄 Weekly report** (or any patient → *Weekly report (PDF)*) → **Download PDF / Print** → *Save as PDF*.
12. **Scan medicine:** Lakshmi → **📷 Scan medicine** → tap the *Glycomet* sample (or photograph a real strip) → ✅ on prescription. Log in as **Puttamma** (9400000005) and scan *Glycomet* → ⛔ *same medicine already prescribed (Metformin)* — catches double-dosing from two brands.
13. **Cheaper medicines:** Lakshmi → **💊 Cheaper medicines** → nearest PHC / Jan Aushadhi Kendra with distance + Directions, and **₹ saved per month** by buying generics.

**v5 – voice reminder calls (1 minute):**

14. Log in as **Ravi** (caregiver) → **Reminder calls** → choose Lakshmi → under *Metformin 500* tap **Record voice message**, say *"Amma, this is Ravi. It's time for your sugar tablet after breakfast — please take one tablet and press TAKEN."* → **Save**. Optionally move the time (e.g. 08:30 → 09:00): it must keep the same number of doses and at least 3 hours apart.
15. Log in as **Lakshmi** → **📞 Reminder calls** → **Test reminder call**. The screen rings like a phone call showing *Ravi Kumar (Son)* → **Answer** → Ravi's voice plays, then the medicine details are read in Kannada → **TAKEN** or **Remind me later** (rings again in 10 min).
16. **Languages:** on the same page, under *Reminder language*, tap **ಕನ್ನಡ** then **English** (numbers show the order) → **Hear all** → **Save**. Test call again: Kannada first, then English. Tap a language chip on the call screen to hear just that one. Ravi can record a Kannada **and** a Hindi message for the same medicine (choose *Language you will record in*).
17. Real timing: use the 🎭 Demo panel (+3h) until a dose is due — the call rings by itself.

Tip: tap once anywhere before the demo. Browsers block sound until the page has been touched.

---

## 4. Commands

| What | Command (run in the project root) |
|---|---|
| Install everything | `npm install` |
| Run backend + frontend | `npm run dev` |
| Run backend only | `npm --prefix server run dev` (API on http://localhost:4000/api/health) |
| Run frontend only | `npm --prefix client run dev` (needs the backend for data) |
| Unit tests (conflicts, escalation, refill, score, chatbot) | `npm test` |
| TypeScript check | `npm run typecheck` |
| Production build of the web app | `npm --prefix client run build` |
| Reset demo database | `npm run db:reset` |

---

## 5. Environment variables (`server/.env`)

Copy `server/.env.example` to `server/.env`. Every value has a safe default for the demo.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 4000 | API port |
| `JWT_SECRET` | demo secret | **Required in production.** A long random string |
| `DATABASE_URL` | *(empty)* | Empty = embedded PostgreSQL. Set it to use real PostgreSQL / Supabase |
| `DEMO_MODE` | true | Seeds demo data and enables the demo clock. **Set false in production** |
| `TZ` | Asia/Kolkata | Time zone used for "today" and dose times |
| `REMINDER_1_MIN` / `REMINDER_2_MIN` | 10 / 20 | Minutes after the due time for the 1st and 2nd reminders |
| `CAREGIVER_ALERT_MIN` | 45 | Minutes until a dose is marked missed and the caregiver is alerted |
| `REPEAT_MISS_THRESHOLD` / `REPEAT_MISS_WINDOW_DAYS` | 3 / 7 | Repeated misses that trigger an ASHA alert |
| `REFILL_SOON_DAYS` / `REFILL_CRITICAL_DAYS` / `REFILL_BUFFER_DAYS` | 7 / 3 / 2 | Stock thresholds 🟢🟡🔴 and refill-by buffer |

**Using Supabase:** create a project, copy the *Connection string (URI)* from Database settings into `DATABASE_URL`, and start the server. The tables are created automatically. Seeding only runs on an empty database with `DEMO_MODE=true`.

---

## 6. Architecture

```
dawaasathi/
├─ server/                      Node.js + Express + TypeScript API
│  └─ src/
│     ├─ domain/                pure, unit-tested rules (no database)
│     │   ├─ conflicts.ts       duplicate / same ingredient / different prescribers / schedule / food timing / missing dosage
│     │   ├─ schedule.ts        frequency + food rule → dose times
│     │   ├─ escalation.ts      due → reminder → 2nd reminder → missed
│     │   ├─ refill.ts          days left, run-out date, refill-by date, 🟢🟡🔴
│     │   ├─ riskScore.ts       transparent Medication Safety Score
│     │   ├─ chatbot.ts         Ask DawaaSathi: intents, safety rules, EN/KN/HI answers
│     │   └─ *.test.ts          29 tests
│     ├─ db/                    schema (14 tables), PGlite/PostgreSQL adapter, demo seed, reset
│     ├─ services/              access control, doses, prescriptions, alerts, overview/stats, audit
│     ├─ routes/                REST API (auth, patients, prescriptions, doses, alerts, dashboards, admin, demo)
│     ├─ jobs/scheduler.ts      Dose Guardian job, every 30 s
│     ├─ middleware/auth.ts     JWT + role checks
│     └─ validation.ts          Zod schemas for every request body
└─ client/                      React + TypeScript + Vite + Tailwind PWA
   └─ src/
      ├─ pages/                 auth, patient (5), caregiver, staff (ASHA + doctor), admin, shared patient detail
      ├─ components/            DoseCard, Insights (score, conflicts, stock, Recharts), PatientTable, AlertList,
      │                         PrescriptionForm, RefillForm, HelpButton, NotificationBell, DemoPanel, AppShell
      ├─ hooks/                 useApi (loading/error/offline cache), useConfirmDose, usePatientReminders
      ├─ lib/                   offline queue (IndexedDB), speech (TTS + voice confirm + notifications), formatting
      ├─ i18n.ts                English / Kannada / Hindi
      └─ store/                 auth + toasts (Zustand)
```

### Pages
`/login` `/login/patient` `/login/caregiver` `/login/asha` `/login/staff` `/register` · `/patient/dashboard` `/patient/today` `/patient/medicines` `/patient/history` `/patient/refills` `/patient/ask` · `/caregiver/dashboard` `/caregiver/ask` · `/asha/dashboard` `/asha/patients` `/asha/alerts` · `/doctor/dashboard` `/doctor/patients` `/doctor/prescriptions` `/doctor/reports` · `/admin/dashboard` `/admin/users` · `/patients/:id` (shared detail)

---

## 7. Database schema (PostgreSQL)

Defined in `server/src/db/schema.ts` and created automatically. All tables have foreign keys and `created_at`; mutable tables also have `updated_at`. Every column has a CHECK constraint, so bad data is rejected by the database as well as the API.

| Table | Purpose |
|---|---|
| `users` | Login accounts: name, unique phone, bcrypt hash, role, language, active |
| `doctors`, `asha_workers`, `caregivers` | Role profiles (facility / area / relation) linked to `users` |
| `patients` | Patient record + conditions + links to caregiver, ASHA, doctor |
| `medications` | Catalogue with **active ingredients** (used for duplicate detection) |
| `prescriptions` | Dosage, tablets per dose, frequency or exact times, food rule, prescriber, source, dates, current quantity |
| `medication_schedules` | Generated daily times per prescription |
| `dose_logs` | One row per scheduled dose: status, confirmation time, **method** (button/voice/caregiver/ASHA/auto), reminders, escalation level |
| `refills` | Tablets received, by whom, when |
| `alerts` | Missed dose, repeated misses, refill, conflict, help; with target role and status (deduplicated) |
| `patient_risk_scores` | Score history with the factor breakdown |
| `notifications` | Per-user in-app notifications (also shown as browser notifications) |
| `audit_logs` | Who did what, when (logins, views of patient records, every change) |

---

## 8. API endpoints

All under `/api`. Everything except health, login and register needs `Authorization: Bearer <token>`. Access to patient data is checked on **every** request: patients see themselves, caregivers their linked patients, ASHA workers and doctors their assigned patients, admins everyone.

| Method | Endpoint | Who | Purpose |
|---|---|---|---|
| GET | `/health` | public | Status, demo mode, server time, escalation settings |
| POST | `/auth/login` | public | Phone + password (+ optional `portal`: patient / caregiver / asha / staff) → JWT (rate-limited) |
| POST | `/auth/register` | public | Self-register as **patient or caregiver** only |
| GET / PATCH | `/auth/me` | any | Profile / change language |
| GET | `/dashboard/patient` · `/caregiver` · `/asha` · `/doctor` · `/admin` | that role | Dashboard data |
| GET / POST | `/patients` | staff | Scoped patient list with risk / adherence / refill · create patient (ASHA, doctor, admin) |
| GET / PATCH | `/patients/:id` | linked | Full overview · update (staff re-assignment: admin only) |
| GET | `/patients/:id/doses?date=` | linked | Day's doses |
| GET | `/patients/:id/history?days=` | linked | Adherence series + dose log |
| GET / POST | `/patients/:id/prescriptions` | linked / doctor, ASHA, admin | List (`?all=true` includes stopped) · add prescription |
| GET | `/patients/:id/conflicts` | linked | Current conflict warnings |
| GET | `/patients/:id/refills` | linked | Refill predictions + refill history |
| GET | `/patients/:id/risk` | linked | Safety score + factors + history |
| GET | `/patients/:id/report` | doctor, ASHA, admin | Follow-up report |
| POST | `/patients/:id/help` | patient, caregiver | HELP button → alerts caregiver, ASHA, doctor |
| POST | `/chat` | patient (own), caregiver / ASHA / doctor / admin (with `patientId`) | Ask DawaaSathi chatbot: `{ message, lang?, patientId? }` → `{ reply: { intent, text, lines, emergency, disclaimer } }`. Rate-limited to 30/min |
| POST | `/prescriptions/check` | doctor, ASHA, admin | Conflict preview for a draft (nothing saved) |
| PATCH | `/prescriptions/:id` | doctor, ASHA, admin | Update and regenerate the schedule |
| POST | `/prescriptions/:id/stop` | doctor, ASHA, admin | Stop a prescription |
| POST | `/prescriptions/:id/refills` | caregiver, ASHA, doctor, admin | Record tablets received |
| POST | `/doses/:id/confirm` | patient, caregiver, ASHA, admin | TAKEN / MISSED (`method`: button or voice) |
| POST | `/doses/sync` | same | Offline queue upload (idempotent) |
| GET | `/alerts?status=&type=&mine=` | caregiver, ASHA, doctor, admin | Scoped alerts |
| POST | `/alerts/:id/ack` · `/alerts/:id/resolve` | same | Update alert status |
| GET / POST | `/notifications` · `/notifications/read-all` · `/notifications/:id/read` | any | Own notifications |
| GET | `/medications` | any | Medicine catalogue |
| GET | `/staff` | ASHA, doctor, admin | Doctor / ASHA / caregiver lists for assignment |
| GET / POST / PATCH | `/admin/users` · `/admin/users/:id` | admin | Manage users (activate / deactivate) |
| GET | `/admin/audit-logs` | admin | Audit trail |
| POST | `/demo/advance` · `/demo/reset-clock` | any (DEMO_MODE only) | Move the server clock for demos |
| GET / POST | `/patients/:id/vitals?days=` | linked (POST: patient, caregiver, ASHA, doctor, admin) | Health readings. POST `{ kind, value1, value2?, note?, measuredAt? }` → level (normal / watch / high / urgent), advice, who was alerted |
| GET | `/patients/:id/weekly-report?days=7` | linked | Weekly report data (adherence, missed doses, vitals, consults, alerts) |
| GET / POST | `/teleconsults` | linked (POST: patient, caregiver, ASHA, admin) | Video-call requests. Max 2 open per patient |
| PATCH | `/teleconsults/:id` | doctor, admin (requester may cancel) | `{ status: confirmed \| completed \| cancelled, scheduledAt?, doctorNote? }` → Jitsi link on confirm |
| POST | `/scan/match` | any (patient-scoped) | `{ text, patientId? }` → matched medicines + prescribed / duplicate / not-prescribed status |
| GET | `/pharmacies?lat=&lng=&kind=&patientId=` | any | Nearest pharmacies, generic price list, monthly savings |
| GET | `/patients/:id/reminders?audio=1` | linked | Medicines with their reminder times + active voice recordings |
| POST | `/patients/:id/reminders/voice` | linked (any role) | `{ prescriptionId? (null = all medicines), audio (base64), mime, durationSec ≤ 60 }` — replaces the same person's previous recording; max 12 per patient |
| PUT | `/patients/:id/reminders/languages` | patient (own), caregiver, ASHA, doctor, admin | `{ languages: ["kn","en"] }` — 1–3 of en, kn, hi, ta, te, mr, spoken in order |
| PUT | `/patients/:id/reminders/times/:rxId` | caregiver, ASHA, doctor, admin | `{ times: ["09:00","21:00"] }` — same number of doses, ≥ 3 h apart; regenerates the schedule and notifies everyone |
| DELETE | `/voice-reminders/:id` | recorder, ASHA, doctor, admin | Remove a recording |
| POST | `/assistant` | patient | Voice assistant: `{ text, lang }` → `{ intent, reply: { text, lines, emergency }, action: call / confirm_help / navigate / refresh, ai }` (rate-limited 30/min) |
| GET | `/alerts/:id/message` | caregiver, ASHA, doctor, admin | SMS / WhatsApp text per recipient + wa.me / sms: links |

---

## 9. How the rules work (transparent by design)

**Conflict detection** (`domain/conflicts.ts`) flags, among overlapping active prescriptions:
- the same medicine twice, or from different prescribers;
- the same **active ingredient** under different names (e.g. Metformin and Glycomet, Amlodipine and Telma-AM);
- before-food and after/with-food medicines at the same time;
- a food rule that contradicts the time (e.g. "before food" at 8:30, after an 8:00 breakfast);
- missing dosage or frequency.

Every message ends with *"Please verify with the doctor/pharmacist."* It **does not** claim any drug interaction is dangerous, because that needs an approved interaction database.

**Medication Safety Score** = 100 minus:

| Factor | Deduction | Maximum |
|---|---|---|
| Adherence (7 days) | 0.4 per % below 100 | 40 |
| Missed doses (7 days) | 3 each | 20 |
| Refill risk | 10 per "may run out", 4 per "refill soon" | 15 |
| Prescription warnings | 5 each | 15 |
| Open alerts | 2 each | 10 |

The score is **Low** risk at 75 or above, **Medium** from 50 to 74, and **High** below 50. Every deduction is shown on screen.

**Refill prediction:** days left = tablets ÷ (tablets per dose × doses per day). The refill-by date is the run-out date minus a 2-day buffer. The status is 🔴 at 3 days or less, 🟡 at 7 days or less, otherwise 🟢. A course that ends before the stock runs out counts as safe.

**Ask DawaaSathi chatbot** (`domain/chatbot.ts`, `routes/chat.ts`) is rule-based and runs on the server, so there are no AI keys and no data leaves the server. It checks questions in this order:
1. **Emergency words** (chest pain, can't breathe, fainted… in English, Kannada and Hindi) → *seek immediate medical attention* and a **Call 108** button.
2. **Missed dose** → *do NOT take an extra or double dose*; take the next dose at the usual time unless the doctor said otherwise.
3. **Diagnosis, prescribing or dose-change questions** → polite refusal: *talk to your doctor or pharmacist*.
4. Answers from the patient's **own** data: today's medicines, next medicine, tablets left and refill dates, before or after food, and what a medicine is for (matched by brand or active ingredient, with a warning if it is not prescribed).

Every answer carries the disclaimer *"For information only — not medical advice."* Questions are **not stored**; the audit log records only the type of question. To add an LLM later, call it from `routes/chat.ts` (server side only) and keep these checks in front of it.

---

## 10. Security

- Passwords hashed with **bcrypt**; JWT sessions (12 h); the user is re-checked on every request, so deactivation takes effect immediately.
- **Role-based authorization** on the server (route roles + per-patient access checks) and protected routes in the client.
- **Zod validation** on every request body and on every client form (React Hook Form). Database CHECK constraints add a second layer.
- Helmet security headers, CORS restricted to the client origin, a 100 KB body limit, and a login rate limit (20 attempts per 15 minutes).
- **Audit log** for logins (failed logins too, with the phone number masked), patient-record views, prescriptions, doses, refills, alerts and user changes.
- No API keys in the frontend. Secrets live in `server/.env` (git-ignored).
- Doctors cannot record doses. Caregivers cannot prescribe. Only admins can re-assign ASHA workers or doctors.

---

## 11. Testing checklist

| # | Test | Expected |
|---|---|---|
| 1 | Log in with a wrong password | "Wrong mobile number or password" |
| 1b | Ravi's caregiver account on the **Patient** login | Refused, with a link to the Caregiver login |
| 2 | Register as patient with a weak password | Field errors shown |
| 3 | Each demo role logs in | Lands on its own dashboard; other roles' URLs redirect back |
| 4 | Caregiver Ravi opens `/patients/3` | "You do not have access to this patient" |
| 5 | Patient taps TAKEN | Toast, progress goes up, stock goes down by tablets-per-dose |
| 6 | "Say Taken" (Chrome/Edge on Android or desktop) | Records the dose with method `voice` |
| 7 | Demo clock +3h, then +10m, +10m, +30m | Reminders, then caregiver *Missed dose* alert |
| 8 | Doctor adds Glycomet for Lakshmi | Warning shown before saving: same active ingredient |
| 9 | Prescription with dosage "lots" | "Write dosage like 500mg" |
| 10 | Record a refill of 30 tablets | Days left and 🟢🟡🔴 update; refill alert resolves |
| 11 | Go offline and tap TAKEN | "Saved. It will sync…"; it syncs when back online |
| 12 | Resize to a phone width | Bottom navigation, large buttons, no horizontal scroll |
| 13 | Ask: "I missed a dose, should I take double?" | Says do NOT take an extra or double dose |
| 14 | Ask: "chest pain" | Emergency answer + Call 108 button |
| 15 | Ask in Kannada: "ಇಂದಿನ ಔಷಧಿ" | Today's list in Kannada |
| 16 | `npm test` | 29 passing tests |

---

## 12. What was verified, and known limitations

**Verified while building:**
- All 42 unit tests pass (18 rule tests + 11 chatbot tests + 13 v4/v5 tests for vitals bands, pill matching, pharmacy maths and reminder-time rules).
- **v8 voice assistant: 19 API checks + 5 unit tests pass** — readings by voice in 3 languages (incl. Kannada/Devanagari digits), only *due* doses are marked taken (never future ones), "I did not take it" gets the no-double-dose advice, emergency words → 108, calls use the saved caregiver / ASHA number, HELP needs a confirm tap, caregivers cannot use the patient assistant.
- **v5/v6 reminder calls: 42 API checks against PostgreSQL pass** (including reminder languages: 1–3, no duplicates, only supported codes, one recording per medicine per language) — recording upload validation (format, length, base64 only), replace-on-re-record, access control, notifications, time changes (dose count locked, 3-hour gap, schedule regenerated), delete permissions.
- **v4 features: 56 API checks against real PostgreSQL 16 all pass**: vitals validation and alerting (high → ASHA + doctor, urgent → caregiver too), access control on every new route, teleconsult workflow (request → confirm → complete, limits, who may cancel), pill scan duplicate detection, pharmacy distances and savings, SMS/WhatsApp text in the recipient's language. The v4 seed is idempotent.
- The **server was run against a real PostgreSQL 16 database**: demo seed, the full escalation ladder, refill prediction, safety scores, offline sync, role checks, **60 API checks covering every route**, **14 chatbot endpoint checks** and **11 login-screen checks** all pass.

**Not yet verified:**
- The app (v2) was run on a Windows laptop with the embedded database (PGlite): login, caregiver dashboard and alerts worked. The **new v4 screens have been type-checked but not yet opened in a browser**, so expect a small fix or two on first run.

**Limitations:**
- **Spoken languages depend on the device's voices.** Microsoft Edge has Indian-language voices (Kannada, Hindi, Tamil, Telugu, Marathi); Chrome on Windows may only have English and Hindi. The app warns when a voice is missing — a recorded message in that language always works. Tamil, Telugu and Marathi phrases are drafts for a native speaker to check.
- **Reminder calls ring inside the app** (open or in a background tab, or the installed PWA). A real phone call to a basic keypad phone would need a telephony service (IVR) such as Exotel or Twilio. Browsers may block the ring *sound* until the page has been tapped once; the screen and vibration still appear.
- **Pill scan** loads Tesseract.js (free OCR) from a CDN the first time, so it needs internet. Printed strip names work best; the *sample* buttons work offline for demos.
- **Pharmacy list and prices are sample data** for the prototype (marked "demo"). The *Search real Kendras on Google Maps* button finds real ones.
- **SMS / WhatsApp** is a preview plus `wa.me` / `sms:` links — real automatic sending needs an SMS gateway account.
- **Vitals colours** use general screening ranges and only say "tell your ASHA / doctor"; they are not a diagnosis.
- **Web Push** (notifications while the browser is fully closed) is not implemented, because it needs VAPID keys and a push service. In-app and browser notifications work while the app is open or in a background tab.
- **Voice confirmation** needs a browser with speech recognition (Chrome or Edge). Other browsers show buttons only.
- **Kannada and Hindi** text is a draft; have a native speaker review it.
- **Conflict rules** are a conservative rule set, not a clinical drug-interaction database.
- The reminder job runs inside the API process. For production, run one API instance or move the job to a scheduled worker.
- No ESLint config is included. Run `npm run typecheck` for type errors.
