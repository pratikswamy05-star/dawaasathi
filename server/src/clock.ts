/**
 * Single source of "now" for the whole server.
 * In DEMO_MODE the clock can be moved forward so judges can see escalation in seconds.
 */
let offsetMs = 0;

export const now = () => new Date(Date.now() + offsetMs);
export const clockOffsetMinutes = () => Math.round(offsetMs / 60000);
export const advanceClock = (minutes: number) => {
  offsetMs += minutes * 60000;
};
export const resetClock = () => {
  offsetMs = 0;
};
