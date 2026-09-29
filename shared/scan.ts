import type { ScanResolution, Student } from "./types";
import { isQrToken } from "./ids";
import { fixThaiDigits } from "./keymap";

/**
 * Pull a usable token/code out of raw scanner text. Handles:
 *  - a full URL that embeds ?s=Q-XXXX or /s/Q-XXXX
 *  - stray whitespace / CR-LF
 *  - Thai-glyph digits typed on a Thai layout
 * Returns the trimmed, uppercased candidate.
 */
export function normalizeScan(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const q = u.searchParams.get("s") || u.searchParams.get("code") || u.searchParams.get("q");
      if (q) s = q;
      else {
        const m = /\/s\/([^/?#]+)/.exec(u.pathname);
        if (m) s = decodeURIComponent(m[1]);
      }
    } catch {
      /* not a real URL, keep raw */
    }
  }
  s = s.replace(/[\r\n\t]/g, "").trim();
  // If it looks like a QR token, uppercase; otherwise also repair Thai digits.
  if (/^q-/i.test(s)) return s.toUpperCase();
  return fixThaiDigits(s).toUpperCase();
}

export interface ScanIndex {
  byToken: Map<string, Student>;
  revoked: Map<string, string>; // token -> student_id
  byCode: Map<string, Student>;
  byNumber?: Map<number, Student[]>; // within the active class — a LIST: two students can share a number
}

export function buildIndex(
  students: Student[],
  revokedTokens: Record<string, string>,
  activeClassId?: string | null,
): ScanIndex {
  const byToken = new Map<string, Student>();
  const byCode = new Map<string, Student>();
  const byNumber = new Map<number, Student[]>();
  for (const s of students) {
    byToken.set(s.qr_token.toUpperCase(), s);
    byCode.set(s.code.toUpperCase(), s);
    // only kids who are IN the class right now (a moved-out student's old number is free again)
    if (activeClassId && s.class_id === activeClassId && s.number != null && (s.status ?? "active") === "active") {
      const list = byNumber.get(s.number) ?? [];
      list.push(s);
      byNumber.set(s.number, list);
    }
  }
  const revoked = new Map<string, string>();
  for (const [t, id] of Object.entries(revokedTokens)) revoked.set(t.toUpperCase(), id);
  return { byToken, byCode, byNumber, revoked };
}

/**
 * Resolve a raw scan against the index. Precedence:
 *   1. active qr_token
 *   2. revoked token  -> "revoked"
 *   3. student code   -> only when allowStudentCode (typed or legacy toggle)
 *   4. 1-2 digit class number -> "number" when exactly one student has it, "ambiguous" when
 *      several do (never guessed: picking "whoever comes last" put the mark on the wrong child)
 */
export function resolveScan(
  raw: string,
  index: ScanIndex,
  opts: { allowStudentCode: boolean } = { allowStudentCode: false },
): ScanResolution {
  const s = normalizeScan(raw);
  if (!s) return { kind: "not_found", raw: s };

  const up = s.toUpperCase();

  if (isQrToken(up)) {
    const hit = index.byToken.get(up);
    if (hit) return { kind: "student", studentId: hit.id, raw: s };
    const rev = index.revoked.get(up);
    if (rev) return { kind: "revoked", studentId: rev, raw: s };
    return { kind: "not_found", raw: s };
  }

  // plain student code
  if (opts.allowStudentCode) {
    const hit = index.byCode.get(up);
    if (hit) return { kind: "student", studentId: hit.id, raw: s };
  }

  // 1-2 digit class number (student forgot card)
  if (/^\d{1,2}$/.test(s) && index.byNumber) {
    const hits = index.byNumber.get(Number(s)) ?? [];
    if (hits.length === 1) return { kind: "number", studentId: hits[0].id, raw: s };
    if (hits.length > 1) return { kind: "ambiguous", candidateIds: hits.map((h) => h.id), raw: s };
  }

  // a longer numeric string that matches a code even when toggle is off:
  // treat as not_found unless the toggle is on (handled above).
  return { kind: "not_found", raw: s };
}
