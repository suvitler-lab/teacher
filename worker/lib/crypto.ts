// Password hashing (PBKDF2-SHA256) + token hashing, tuned to stay well under
// the Workers free-tier 10ms CPU budget. ~100k iterations measures ~1-2ms.

const ITERATIONS = 100_000;
const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}

function randomHex(bytes: number): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return toHex(b.buffer);
}

export async function hashPassword(
  password: string,
  pepper: string,
  salt = randomHex(16),
  iterations = ITERATIONS,
): Promise<{ hash: string; salt: string; iterations: number }> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password + pepper),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations },
    key,
    256,
  );
  return { hash: toHex(bits), salt, iterations };
}

export async function verifyPassword(
  password: string,
  pepper: string,
  stored: { hash: string; salt: string; iterations: number },
): Promise<boolean> {
  const { hash } = await hashPassword(password, pepper, stored.salt, stored.iterations);
  return timingSafeEqual(hash, stored.hash);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** SHA-256 hex of a string (used to store session tokens hashed). */
export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return toHex(buf);
}

export function randomToken(bytes = 32): string {
  return randomHex(bytes);
}
