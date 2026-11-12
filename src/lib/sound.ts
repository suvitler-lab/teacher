// Short WebAudio feedback tones. Three cues: ok / duplicate / error.
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tones(seq: [number, number][]) {
  const a = ac();
  if (!a) return;
  let t = a.currentTime;
  for (const [freq, dur] of seq) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.frequency.value = freq;
    o.type = "sine";
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(a.destination);
    o.start(t);
    o.stop(t + dur);
    t += dur + 0.03;
  }
}

export const beep = {
  ok: () => tones([[880, 0.09], [1320, 0.13]]),
  dup: () => tones([[520, 0.12], [520, 0.12]]),
  err: () => tones([[190, 0.32]]),
  undo: () => tones([[660, 0.1], [440, 0.12]]),
};

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

// ---- random-name page: the soft "ting" when a name has settled (T-44, D44) ----
// Off by default, remembered per device (localStorage, never synced). The app-wide sound switch (`sound_enabled`) still
// wins: with it off `ting()` is silent whatever this device remembers. Existing cues above are untouched.
export const RANDOM_TICK_KEY = "ngankrob-random-tick";

export function getRandomTick(): boolean {
  try { return localStorage.getItem(RANDOM_TICK_KEY) === "1"; } catch { return false; }
}
export function setRandomTick(on: boolean) {
  try { localStorage.setItem(RANDOM_TICK_KEY, on ? "1" : "0"); } catch { /* storage blocked: stays off after a reload */ }
}

/** Wake the audio context. Called inside a tap so a later (timer-driven) ting is allowed to play on iOS. */
export function primeAudio() {
  ac();
}

/** One short high note. Silent when the app sound is off. */
export function ting() {
  tones([[1568, 0.16]]);
}
