/** A simple phone-style ring made with the Web Audio API (no sound files needed). */
let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function burst() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  for (const offset of [0, 0.45]) {
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 440;
    osc2.frequency.value = 480;
    gain.gain.setValueAtTime(0, t0 + offset);
    gain.gain.linearRampToValueAtTime(0.18, t0 + offset + 0.03);
    gain.gain.setValueAtTime(0.18, t0 + offset + 0.35);
    gain.gain.linearRampToValueAtTime(0, t0 + offset + 0.4);
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0 + offset);
    osc2.start(t0 + offset);
    osc.stop(t0 + offset + 0.42);
    osc2.stop(t0 + offset + 0.42);
  }
  navigator.vibrate?.([400, 200, 400]);
}

export function startRing() {
  stopRing();
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) {
      ctx = ctx ?? new AC();
      void ctx.resume().catch(() => undefined);
    }
  } catch {
    ctx = null; // sound blocked: the screen and vibration still work
  }
  burst();
  timer = setInterval(burst, 2500);
}

export function stopRing() {
  if (timer) clearInterval(timer);
  timer = null;
  navigator.vibrate?.(0);
}
