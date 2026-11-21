/**
 * Vitals warning levels. These are general SCREENING bands used by community health programmes,
 * not a diagnosis. The app only says "tell your doctor / ASHA" — it never names a disease or changes medicine.
 */
export type VitalKind = 'bp' | 'sugar_fasting' | 'sugar_random' | 'pulse' | 'temperature' | 'weight';
export type VitalLevel = 'normal' | 'watch' | 'high' | 'urgent';

export const VITAL_INFO: Record<VitalKind, { label: string; unit: string; min: number; max: number; min2?: number; max2?: number }> = {
  bp: { label: 'Blood pressure', unit: 'mmHg', min: 50, max: 260, min2: 30, max2: 160 },
  sugar_fasting: { label: 'Sugar (fasting)', unit: 'mg/dL', min: 20, max: 600 },
  sugar_random: { label: 'Sugar (after food / random)', unit: 'mg/dL', min: 20, max: 600 },
  pulse: { label: 'Pulse', unit: 'beats/min', min: 20, max: 250 },
  temperature: { label: 'Temperature', unit: '°F', min: 90, max: 110 },
  weight: { label: 'Weight', unit: 'kg', min: 10, max: 250 },
};

export interface VitalResult {
  level: VitalLevel;
  /** Short, non-diagnostic advice shown to the patient / caregiver. */
  advice: string;
  /** Plain description of the direction, e.g. "high" or "low". */
  direction: 'ok' | 'high' | 'low';
}

const ADVICE: Record<VitalLevel, string> = {
  normal: 'This reading is in the usual range. Keep taking medicines as prescribed.',
  watch: 'A little outside the usual range. Check again later and keep a record.',
  high: 'Outside the usual range. Please tell your ASHA worker or doctor soon.',
  urgent: 'Far outside the usual range. Contact your doctor or ASHA worker today. If there is chest pain, breathlessness, fainting or confusion, call 108.',
};

const r = (level: VitalLevel, direction: VitalResult['direction']): VitalResult => ({ level, advice: ADVICE[level], direction });

export function classifyVital(kind: VitalKind, v1: number, v2?: number | null): VitalResult {
  switch (kind) {
    case 'bp': {
      const sys = v1;
      const dia = v2 ?? 0;
      if (sys < 90 || (v2 != null && dia < 60)) return r(sys < 80 ? 'urgent' : 'high', 'low');
      if (sys >= 180 || dia >= 120) return r('urgent', 'high');
      if (sys >= 140 || dia >= 90) return r('high', 'high');
      if (sys >= 130 || dia >= 80) return r('watch', 'high');
      return r('normal', 'ok');
    }
    case 'sugar_fasting':
      if (v1 < 54) return r('urgent', 'low');
      if (v1 < 70) return r('high', 'low');
      if (v1 >= 250) return r('urgent', 'high');
      if (v1 >= 126) return r('high', 'high');
      if (v1 >= 100) return r('watch', 'high');
      return r('normal', 'ok');
    case 'sugar_random':
      if (v1 < 54) return r('urgent', 'low');
      if (v1 < 70) return r('high', 'low');
      if (v1 >= 300) return r('urgent', 'high');
      if (v1 >= 200) return r('high', 'high');
      if (v1 >= 140) return r('watch', 'high');
      return r('normal', 'ok');
    case 'pulse':
      if (v1 < 40 || v1 > 140) return r('urgent', v1 < 40 ? 'low' : 'high');
      if (v1 < 50 || v1 > 120) return r('high', v1 < 50 ? 'low' : 'high');
      if (v1 < 60 || v1 > 100) return r('watch', v1 < 60 ? 'low' : 'high');
      return r('normal', 'ok');
    case 'temperature':
      if (v1 < 95) return r('urgent', 'low');
      if (v1 >= 103) return r('urgent', 'high');
      if (v1 >= 100.4) return r('high', 'high');
      if (v1 >= 99.5) return r('watch', 'high');
      return r('normal', 'ok');
    case 'weight':
      return r('normal', 'ok');
  }
}

/** Weight change > 3 kg vs the previous reading is worth a "watch". */
export function weightChangeLevel(prev: number | null, current: number): VitalLevel {
  if (prev == null) return 'normal';
  return Math.abs(current - prev) >= 3 ? 'watch' : 'normal';
}

export function formatVital(kind: VitalKind, v1: number, v2?: number | null) {
  const u = VITAL_INFO[kind].unit;
  return kind === 'bp' ? `${Math.round(v1)}/${Math.round(v2 ?? 0)} ${u}` : `${Number(v1.toFixed(1))} ${u}`;
}

/** Three "high" or worse readings of the same kind in a row → worth a doctor's look even if none is urgent. */
export function persistentHigh(levels: VitalLevel[]): boolean {
  return levels.length >= 3 && levels.slice(0, 3).every((l) => l === 'high' || l === 'urgent');
}
