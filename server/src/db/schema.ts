/** Full PostgreSQL schema. Idempotent: safe to run on every start. */
export const SCHEMA_SQL = `
create table if not exists users (
  id serial primary key,
  name text not null check (char_length(name) between 2 and 80),
  phone text not null unique check (phone ~ '^[6-9][0-9]{9}$'),
  email text unique,
  password_hash text not null,
  role text not null check (role in ('patient', 'caregiver', 'asha', 'doctor', 'admin')),
  language text not null default 'en' check (language in ('en', 'kn', 'hi')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists doctors (
  id serial primary key,
  user_id int not null unique references users (id) on delete cascade,
  facility text,
  registration_no text,
  created_at timestamptz not null default now()
);

create table if not exists asha_workers (
  id serial primary key,
  user_id int not null unique references users (id) on delete cascade,
  area text,
  created_at timestamptz not null default now()
);

create table if not exists caregivers (
  id serial primary key,
  user_id int not null unique references users (id) on delete cascade,
  relation text,
  created_at timestamptz not null default now()
);

create table if not exists patients (
  id serial primary key,
  user_id int unique references users (id) on delete set null,
  name text not null check (char_length(name) between 2 and 80),
  age int check (age between 0 and 120),
  gender text check (gender in ('F', 'M', 'O')),
  village text,
  phone text,
  conditions jsonb not null default '[]'::jsonb,
  caregiver_id int references caregivers (id) on delete set null,
  asha_id int references asha_workers (id) on delete set null,
  doctor_id int references doctors (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists medications (
  id serial primary key,
  name text not null unique,
  active_ingredients jsonb not null default '[]'::jsonb,
  strength text,
  form text not null default 'tablet',
  category text not null default 'Other' check (category in ('BP', 'Diabetes', 'Cholesterol', 'Other')),
  instructions text,
  created_at timestamptz not null default now()
);

create table if not exists prescriptions (
  id serial primary key,
  patient_id int not null references patients (id) on delete cascade,
  medication_id int not null references medications (id),
  doctor_id int references doctors (id) on delete set null,
  prescriber_name text not null,
  source text not null default 'PHC' check (source in ('PHC', 'Health camp', 'Private', 'Hospital')),
  dosage text,
  units_per_dose int not null default 1 check (units_per_dose between 1 and 10),
  frequency text check (frequency in ('OD', 'BD', 'TDS', 'QID', 'HS')),
  times jsonb not null default '[]'::jsonb,
  food_rule text not null default 'none' check (food_rule in ('before', 'after', 'with', 'none')),
  start_date date not null,
  end_date date,
  current_quantity int not null default 0 check (current_quantity between 0 and 1000),
  instructions text,
  status text not null default 'active' check (status in ('active', 'stopped')),
  created_by int references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists medication_schedules (
  id serial primary key,
  prescription_id int not null references prescriptions (id) on delete cascade,
  patient_id int not null references patients (id) on delete cascade,
  time_of_day text not null check (time_of_day ~ '^[0-2][0-9]:[0-5][0-9]$'),
  food_rule text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists dose_logs (
  id serial primary key,
  patient_id int not null references patients (id) on delete cascade,
  prescription_id int not null references prescriptions (id) on delete cascade,
  schedule_id int not null references medication_schedules (id) on delete cascade,
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'taken', 'missed')),
  confirmed_at timestamptz,
  method text check (method in ('button', 'voice', 'caregiver', 'asha', 'auto')),
  confirmed_by int references users (id) on delete set null,
  reminder_count int not null default 0,
  escalation_level int not null default 0,
  client_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, scheduled_at)
);
create index if not exists dose_logs_patient_time on dose_logs (patient_id, scheduled_at);
create index if not exists dose_logs_status on dose_logs (status, scheduled_at);

create table if not exists refills (
  id serial primary key,
  prescription_id int not null references prescriptions (id) on delete cascade,
  patient_id int not null references patients (id) on delete cascade,
  quantity_added int not null check (quantity_added between 1 and 1000),
  note text,
  recorded_by int references users (id) on delete set null,
  refilled_at timestamptz not null default now()
);

create table if not exists alerts (
  id serial primary key,
  patient_id int not null references patients (id) on delete cascade,
  dose_log_id int references dose_logs (id) on delete set null,
  prescription_id int references prescriptions (id) on delete set null,
  type text not null check (type in ('missed_dose', 'repeated_miss', 'refill', 'conflict', 'help')),
  severity text not null check (severity in ('low', 'medium', 'high')),
  target_role text not null check (target_role in ('caregiver', 'asha', 'doctor')),
  message text not null,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  acknowledged_by int references users (id) on delete set null,
  acknowledged_at timestamptz,
  dedupe_key text unique,
  created_at timestamptz not null default now()
);
create index if not exists alerts_patient_status on alerts (patient_id, status);

create table if not exists patient_risk_scores (
  id serial primary key,
  patient_id int not null references patients (id) on delete cascade,
  score int not null check (score between 0 and 100),
  level text not null check (level in ('low', 'medium', 'high')),
  factors jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now()
);
create index if not exists risk_patient_time on patient_risk_scores (patient_id, computed_at desc);

create table if not exists notifications (
  id serial primary key,
  user_id int not null references users (id) on delete cascade,
  alert_id int references alerts (id) on delete cascade,
  dose_log_id int references dose_logs (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user on notifications (user_id, created_at desc);

create table if not exists audit_logs (
  id serial primary key,
  user_id int references users (id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists audit_time on audit_logs (created_at desc);

-- ===== v4 features =====
alter table alerts drop constraint if exists alerts_type_check;
alter table alerts add constraint alerts_type_check
  check (type in ('missed_dose', 'repeated_miss', 'refill', 'conflict', 'help', 'vitals', 'teleconsult'));

create table if not exists vitals (
  id serial primary key,
  patient_id int not null references patients (id) on delete cascade,
  kind text not null check (kind in ('bp', 'sugar_fasting', 'sugar_random', 'pulse', 'temperature', 'weight')),
  value1 double precision not null,
  value2 double precision,
  level text not null check (level in ('normal', 'watch', 'high', 'urgent')),
  note text,
  recorded_by int references users (id) on delete set null,
  measured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists vitals_patient_time on vitals (patient_id, measured_at desc);

create table if not exists teleconsults (
  id serial primary key,
  patient_id int not null references patients (id) on delete cascade,
  doctor_id int references doctors (id) on delete set null,
  requested_by int references users (id) on delete set null,
  reason text not null,
  preferred_at timestamptz,
  scheduled_at timestamptz,
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'completed', 'cancelled')),
  room text,
  doctor_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists teleconsults_patient on teleconsults (patient_id, created_at desc);

create table if not exists pharmacies (
  id serial primary key,
  name text not null unique,
  kind text not null check (kind in ('jan_aushadhi', 'phc', 'private')),
  area text not null,
  address text,
  phone text,
  open_hours text,
  lat double precision not null,
  lng double precision not null
);

alter table medications add column if not exists generic_name text;
alter table medications add column if not exists brand_price double precision;
alter table medications add column if not exists generic_price double precision;

-- Voice reminders recorded by family / ASHA / doctor, played to the patient at dose time.
create table if not exists voice_reminders (
  id serial primary key,
  patient_id int not null references patients (id) on delete cascade,
  prescription_id int references prescriptions (id) on delete cascade,
  recorded_by int references users (id) on delete set null,
  audio_base64 text not null,
  mime text not null,
  duration_sec int not null check (duration_sec between 1 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists voice_reminders_patient on voice_reminders (patient_id, active);

-- Reminder languages (spoken in this order at reminder time) and the language of each recording.
alter table patients add column if not exists reminder_languages jsonb not null default '[]'::jsonb;
alter table voice_reminders add column if not exists language text;

-- Emergency card extras, ASHA home visits, streak milestones (praise sent once per streak).
alter table patients add column if not exists blood_group text;
alter table patients add column if not exists allergies text;
alter table patients add column if not exists emergency_notes text;

create table if not exists asha_visits (
  id serial primary key,
  patient_id int not null references patients (id) on delete cascade,
  visit_date date not null,
  status text not null check (status in ('visited', 'not_home')),
  note text,
  visited_by int references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (patient_id, visit_date)
);

create table if not exists streak_milestones (
  id serial primary key,
  patient_id int not null references patients (id) on delete cascade,
  days int not null,
  streak_start date not null,
  created_at timestamptz not null default now(),
  unique (patient_id, days, streak_start)
);
`;
