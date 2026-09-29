// Thai Kedmanee keyboard: map physical key codes to the digits/letters a
// scanner *intends*. HID scanners type keystrokes; if the OS layout is Thai,
// reading KeyboardEvent.key yields Thai glyphs ("ๅ" for the "1" key). Reading
// KeyboardEvent.code ("Digit1") is layout-independent, so we decode from code.

// code -> character produced on a US layout (what QR/Code128 payloads assume).
const CODE_TO_CHAR: Record<string, string> = {
  Digit0: "0", Digit1: "1", Digit2: "2", Digit3: "3", Digit4: "4",
  Digit5: "5", Digit6: "6", Digit7: "7", Digit8: "8", Digit9: "9",
  Minus: "-", Equal: "=", Period: ".", Slash: "/",
  KeyA: "A", KeyB: "B", KeyC: "C", KeyD: "D", KeyE: "E", KeyF: "F",
  KeyG: "G", KeyH: "H", KeyI: "I", KeyJ: "J", KeyK: "K", KeyL: "L",
  KeyM: "M", KeyN: "N", KeyO: "O", KeyP: "P", KeyQ: "Q", KeyR: "R",
  KeyS: "S", KeyT: "T", KeyU: "U", KeyV: "V", KeyW: "W", KeyX: "X",
  KeyY: "Y", KeyZ: "Z",
};

/**
 * Best-effort char for a keydown, preferring the physical code so a Thai
 * layout doesn't corrupt scanned codes. Falls back to event.key for ASCII.
 */
export function charFromKey(code: string, key: string): string | null {
  const byCode = CODE_TO_CHAR[code];
  if (byCode) return byCode;
  // digits on the numpad
  const np = /^Numpad(\d)$/.exec(code);
  if (np) return np[1];
  // fallback: single ASCII char from key
  if (key && key.length === 1 && /[0-9A-Za-z\-=./]/.test(key)) return key.toUpperCase();
  return null;
}

// Thai-glyph -> intended char, for when a human typed a code while the layout
// was Thai (number row). Only the characters we care about for student codes.
const THAI_TO_CHAR: Record<string, string> = {
  "ๅ": "1", "/": "1", "-": "5", "ภ": "2", "ถ": "3", "ุ": "4", "ู": "4",
  "ึ": "5", "ค": "6", "ต": "7", "จ": "8", "ข": "9", "ช": "0",
};

export function fixThaiDigits(s: string): string {
  return s
    .split("")
    .map((ch) => THAI_TO_CHAR[ch] ?? ch)
    .join("");
}
