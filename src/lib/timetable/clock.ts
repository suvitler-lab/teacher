// The one place the timetable reads "now" (test-plan §4). Everything time-dependent takes `nowMs` from here, so a test or
// a fixture page can pin the clock. Days and hours are always Asia/Bangkok (UTC+7), whatever zone the device is set to.
import { signal } from "@preact/signals";

export const BANGKOK_OFFSET_MS = 7 * 3600_000;

export interface BangkokTime {
  date: string; // "YYYY-MM-DD" (Gregorian)
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO: 1 = Monday … 7 = Sunday
  minutes: number; // minutes since midnight
  seconds: number; // seconds since midnight
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The Bangkok wall clock for an instant. Uses UTC arithmetic only, so the device zone never matters. */
export function bangkok(ms: number): BangkokTime {
  const d = new Date(ms + BANGKOK_OFFSET_MS);
  const dow = d.getUTCDay(); // 0 = Sunday
  const seconds = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    weekday: (dow === 0 ? 7 : dow) as BangkokTime["weekday"],
    minutes: Math.floor(seconds / 60),
    seconds,
  };
}

/** Calendar addition on a "YYYY-MM-DD" string (real calendar, never +24 h). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** "HH:MM" Bangkok of an instant. */
export function bangkokHM(ms: number): string {
  const t = bangkok(ms);
  return `${pad(Math.floor(t.minutes / 60))}:${pad(t.minutes % 60)}`;
}

const NO_ZONE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * `2026-11-11T09:45` (no zone) = Bangkok wall time · `2026-11-11T02:45:00Z` / `+07:00` = that exact instant.
 * Anything else = null.
 */
export function parseNowParam(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const v = raw.trim();
  const m = NO_ZONE.exec(v);
  if (m) {
    const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
    const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - BANGKOK_OFFSET_MS;
    return Number.isFinite(ms) ? ms : null;
  }
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(v)) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

// ---- injectable clock ----------------------------------------------------------------------------------------
let anchor: { base: number; at: number } | null = null; // pinned instant, advancing from the moment it was pinned
let source: (() => number) | null = null; // test hook: replaces everything

const realNow = () => Date.now();
const perf = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** The current instant (epoch ms). Pinned by `?now=` (fixture/dev only) or `setClock`; otherwise the device clock. */
export function now(): number {
  if (source) return source();
  if (anchor) return anchor.base + (perf() - anchor.at);
  return realNow();
}

/** Tests: pass a function (or a fixed number) to replace the clock; null puts the real one back. */
export function setClock(next: (() => number) | number | null): void {
  source = next === null ? null : typeof next === "number" ? () => next : next;
  anchor = null;
  tickNow();
}

/** Pin the clock to an instant that then keeps running (so "wait for 10:30" works in a fixture page). */
export function pinClock(ms: number | null): void {
  anchor = ms === null ? null : { base: ms, at: perf() };
  source = null;
  tickNow();
}

/** `?now=` is honoured only where fixtures and local development run — never on the real site. */
export function nowOverrideAllowed(loc: Pick<Location, "hostname"> = location): boolean {
  let dev = false;
  try { dev = !!import.meta.env?.DEV; } catch { /* not a bundler build */ }
  const h = (loc.hostname || "").toLowerCase();
  return dev || h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1" || h.endsWith(".localhost") || h.endsWith(".test");
}

/** Read `?now=` from the search string or from the hash route (`#/home?now=…`). */
export function nowParamOf(loc: Pick<Location, "search" | "hash">): string | null {
  const fromSearch = new URLSearchParams(loc.search || "").get("now");
  if (fromSearch) return fromSearch;
  const h = loc.hash || "";
  const q = h.indexOf("?");
  return q >= 0 ? new URLSearchParams(h.slice(q + 1)).get("now") : null;
}

/**
 * Call once at start-up. In fixture/dev mode pins the clock from `?now=`; also exposes `window.__ttSetNow("…")` so a
 * test page can jump the clock. Returns whether a pin was applied.
 */
export function initClockFromLocation(loc: Pick<Location, "search" | "hash" | "hostname"> = location): boolean {
  if (!nowOverrideAllowed(loc)) return false;
  try {
    (window as unknown as { __ttSetNow?: (v: string | null) => void }).__ttSetNow = (v) => pinClock(v ? parseNowParam(v) : null);
  } catch { /* no window */ }
  const ms = parseNowParam(nowParamOf(loc));
  if (ms === null) return false;
  pinClock(ms);
  return true;
}

// ---- 60-second tick ------------------------------------------------------------------------------------------
/** What every time-dependent view reads: bumped about once a minute and when the tab comes back. */
export const ttNowMs = signal<number>(now());

export function tickNow(): void {
  ttNowMs.value = now();
}

export const TICK_MS = 60_000;

/** Start the 60 s recalculation while a page that shows now/next is open. Returns the stop function. */
export function startTimetableClock(): () => void {
  tickNow();
  const id = setInterval(tickNow, TICK_MS);
  const onVisible = () => { if (typeof document === "undefined" || document.visibilityState !== "hidden") tickNow(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(id);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
  };
}
