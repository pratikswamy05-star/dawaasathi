export type Role = 'patient' | 'caregiver' | 'asha' | 'doctor' | 'admin';
export type Lang = 'en' | 'kn' | 'hi';
export type DoseStatus = 'pending' | 'taken' | 'missed';
export type FoodRule = 'before' | 'after' | 'with' | 'none';
export type RiskLevel = 'low' | 'medium' | 'high';
export type StockStatus = 'safe' | 'soon' | 'critical';

export interface User {
  id: number;
  name: string;
  phone: string;
  role: Role;
  language: Lang;
  patientId: number | null;
}

export interface Dose {
  id: number;
  patient_id: number;
  prescription_id: number;
  scheduled_at: string;
  status: DoseStatus;
  confirmed_at: string | null;
  method: string | null;
  reminder_count: number;
  escalation_level: number;
  dosage: string | null;
  units_per_dose: number;
  food_rule: FoodRule;
  current_quantity: number;
  instructions: string | null;
  medication_name: string;
  category: string;
  medication_instructions: string | null;
}

export interface Prescription {
  id: number;
  patient_id: number;
  medication_id: number;
  prescriber_name: string;
  source: string;
  dosage: string | null;
  units_per_dose: number;
  frequency: string | null;
  times: string[];
  food_rule: FoodRule;
  start_date: string;
  end_date: string | null;
  current_quantity: number;
  instructions: string | null;
  status: 'active' | 'stopped';
  medication_name: string;
  active_ingredients: string[];
  category: string;
  strength: string | null;
  medication_instructions: string | null;
}

export interface Conflict {
  type: string;
  severity: 'warning' | 'info';
  message: string;
  prescriptionIds: (number | string)[];
  medicines: string[];
}

export interface RefillPrediction {
  prescriptionId: number;
  medicationName: string;
  dosage: string | null;
  unitsPerDose: number;
  remaining: number;
  perDay: number;
  daysLeft: number | null;
  runOutDate: string | null;
  refillBy: string | null;
  status: StockStatus;
}

export interface RiskFactor {
  key: string;
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface Risk {
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
}

export interface SeriesPoint {
  date: string;
  taken: number;
  missed: number;
  pct: number | null;
}

export interface Adherence {
  taken: number;
  missed: number;
  pending: number;
  pct: number | null;
}

export interface PatientInfo {
  id: number;
  name: string;
  age: number | null;
  gender: string | null;
  village: string | null;
  phone: string | null;
  conditions: string[];
  caregiver_name: string | null;
  caregiver_phone: string | null;
  caregiver_relation: string | null;
  asha_name: string | null;
  asha_phone: string | null;
  doctor_name: string | null;
  doctor_facility: string | null;
}

export interface Overview {
  patient: PatientInfo;
  today: Dose[];
  adherence7d: Adherence;
  adherence30d: Adherence;
  series: SeriesPoint[];
  refills: RefillPrediction[];
  conflicts: Conflict[];
  risk: Risk;
  prescriptions: Prescription[];
  streak?: Streak;
}

export interface PatientSummary {
  id: number;
  name: string;
  age: number | null;
  village: string | null;
  conditions: string[];
  adherence7d: number | null;
  missed7d: number;
  missedToday: number;
  takenToday: number;
  totalToday: number;
  refillDaysLeft: number | null;
  refillStatus: StockStatus;
  risk: Risk;
  openAlerts: number;
}

export interface Alert {
  id: number;
  patient_id: number;
  patient_name?: string;
  type: 'missed_dose' | 'repeated_miss' | 'refill' | 'conflict' | 'help' | 'vitals' | 'teleconsult';
  severity: 'low' | 'medium' | 'high';
  target_role?: string;
  message: string;
  status: 'open' | 'acknowledged' | 'resolved';
  created_at: string;
}

export interface Notification {
  id: number;
  type: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface Medication {
  id: number;
  name: string;
  active_ingredients: string[];
  strength: string | null;
  category: string;
  instructions: string | null;
}

// ===== v4 features =====
export type VitalKind = 'bp' | 'sugar_fasting' | 'sugar_random' | 'pulse' | 'temperature' | 'weight';
export type VitalLevel = 'normal' | 'watch' | 'high' | 'urgent';

export interface Vital {
  id: number;
  kind: VitalKind;
  value1: number;
  value2: number | null;
  level: VitalLevel;
  note: string | null;
  measured_at: string;
  display: string;
  advice: string;
  recorded_by_name?: string | null;
  recorded_by_role?: string | null;
}

export interface VitalKindInfo {
  label: string;
  unit: string;
  min: number;
  max: number;
  min2?: number;
  max2?: number;
}

export interface Teleconsult {
  id: number;
  patient_id: number;
  patient_name: string;
  village: string | null;
  doctor_name: string | null;
  requested_by: number | null;
  requested_by_name: string | null;
  requested_by_role: string | null;
  reason: string;
  preferred_at: string | null;
  scheduled_at: string | null;
  status: 'requested' | 'confirmed' | 'completed' | 'cancelled';
  doctor_note: string | null;
  joinUrl: string | null;
  created_at: string;
}

export interface ScanResult {
  id: number;
  name: string;
  ingredients: string[];
  strength: string | null;
  category: string;
  instructions: string | null;
  genericName: string | null;
  brandPrice: number | null;
  genericPrice: number | null;
  confidence: 'high' | 'medium' | 'low';
  matchedWords: string[];
  status: 'prescribed' | 'duplicate' | 'not_prescribed' | 'unknown';
  note: string;
}

export interface Pharmacy {
  id: number;
  name: string;
  kind: 'jan_aushadhi' | 'phc' | 'private';
  area: string;
  address: string | null;
  phone: string | null;
  open_hours: string | null;
  lat: number;
  lng: number;
  distanceKm: number;
  directionsUrl: string;
}

export interface PharmacyResponse {
  origin: { lat: number; lng: number; label: string };
  pharmacies: Pharmacy[];
  prices: { id: number; name: string; generic_name: string | null; strength: string | null; brand_price: number; generic_price: number }[];
  savings: { medicationName: string; genericName: string | null; brandPrice: number; genericPrice: number; perMonth: number | null }[];
  totalMonthlySaving: number;
  searchUrl: string;
  note: string;
}

export interface MessageRecipient {
  name: string;
  role: string;
  phone: string;
  language: Lang;
  text: string;
  smsParts: number;
  whatsappUrl: string;
  smsUrl: string;
}

export interface VoiceReminder {
  id: number;
  patient_id: number;
  prescription_id: number | null;
  language: string | null;
  mime: string;
  duration_sec: number;
  created_at: string;
  recorded_by: number | null;
  recorded_by_name: string | null;
  recorded_by_role: Role | null;
  recorded_by_relation: string | null;
  medication_name: string | null;
  audio_base64?: string;
}

export interface ReminderRx {
  id: number;
  medication_name: string;
  dosage: string | null;
  food_rule: FoodRule;
  frequency: string | null;
  prescriber_name: string;
  times: string[];
  dosesPerDay: number;
}

export interface Streak {
  current: number;
  best: number;
  start: string | null;
  next: number | null;
  reached: number | null;
  last7: { date: string; state: 'full' | 'missed' | 'open' | 'none' }[];
}

export interface EmergencyCardData {
  patient: {
    id: number;
    name: string;
    age: number | null;
    gender: string | null;
    village: string | null;
    phone: string | null;
    conditions: string[];
    bloodGroup: string | null;
    allergies: string | null;
    notes: string | null;
  };
  medicines: { name: string; dosage: string | null; times: string[]; food: string; ingredients: string[] }[];
  contacts: { role: string; name: string; phone: string | null }[];
  latestReadings: { kind: string; display: string; at: string }[];
  generatedAt: string;
}

export interface VisitItem {
  patientId: number;
  name: string;
  age: number | null;
  village: string;
  phone: string | null;
  caregiverName: string | null;
  caregiverPhone: string | null;
  risk: Risk;
  streak: number;
  priority: number;
  urgent: boolean;
  reasons: { code: string; text: string; weight: number; tone: 'red' | 'amber' | 'green' | 'slate' }[];
  lastVisit: string | null;
  today: { status: 'visited' | 'not_home'; note: string | null } | null;
  mapsUrl: string;
}
