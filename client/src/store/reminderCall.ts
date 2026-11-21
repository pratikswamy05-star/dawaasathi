import { create } from 'zustand';
import type { Dose } from '../types';

interface CallState {
  /** The dose the phone-style reminder is ringing for (null = no call on screen). */
  dose: Dose | null;
  stage: number;
  test: boolean;
  ring: (dose: Dose, stage?: number, test?: boolean) => void;
  hangUp: () => void;
}

/** Global "incoming reminder call" state, shared by the reminder hook and the call screen. */
export const useReminderCall = create<CallState>((set, get) => ({
  dose: null,
  stage: 0,
  test: false,
  ring: (dose, stage = 0, test = false) => {
    if (get().dose) return; // one call at a time
    set({ dose, stage, test });
  },
  hangUp: () => set({ dose: null, stage: 0, test: false }),
}));
