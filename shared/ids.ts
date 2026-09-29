// ULID + QR token generation, usable in both worker and browser (Web Crypto).

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // no I, L, O, U

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/**
 * ULID: 26 chars, 48-bit timestamp + 80-bit randomness, Crockford base32,
 * lexicographically sortable by time. Good as a distributed primary key.
 */
export function ulid(time: number = Date.now()): string {
  let ts = "";
  let t = Math.floor(time);
  for (let i = 0; i < 10; i++) {
    ts = CROCKFORD[t % 32] + ts;
    t = Math.floor(t / 32);
  }
  const rnd = randomBytes(16);
  let r = "";
  for (let i = 0; i < 16; i++) r += CROCKFORD[rnd[i] % 32];
  return ts + r;
}

/** Prefixed ULID, e.g. id("asg") -> "asg_01J..." */
export function id(prefix: string): string {
  return `${prefix}_${ulid()}`;
}

/**
 * QR token: "Q-" + 10 uppercase Crockford chars (~50 bits).
 * Uppercase-only so the QR uses alphanumeric mode (stays small / version <= 2)
 * and survives a scanner stuck on Caps Lock.
 */
export function qrToken(): string {
  const rnd = randomBytes(10);
  let s = "";
  for (let i = 0; i < 10; i++) s += CROCKFORD[rnd[i] % 32];
  return "Q-" + s;
}

export function isQrToken(s: string): boolean {
  return /^Q-[0-9A-HJKMNP-TV-Z]{10}$/.test(s);
}
