import type { Student } from "@shared/types";

const LEADING_VOWELS = "เแโใไ";

export function fullName(s: Student): string {
  return `${s.prefix ?? ""}${s.first_name} ${s.last_name}`.trim();
}

export function shortName(s: Student): string {
  return s.nickname || s.first_name;
}

export function initials(s: Student): string {
  const f = s.first_name || "?";
  return LEADING_VOWELS.includes(f[0]) ? f.slice(0, 2) : f[0];
}
