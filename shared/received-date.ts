// The one "received date" rule (c03-submit-date · D-c03-submit-date-01), shared by the worker and the screens so the
// date picker and the server never disagree. Pure: no worker dependency.
//
// A received date is a Thai calendar day "YYYY-MM-DD" (Common Era). It is stored in the existing `submitted_at`
// (no new column — D-c03-submit-date-02): another day becomes 12:00 Bangkok of that day (never later than now), so
// its Thai date is always the one chosen and `late` keeps being decided by the one rule (BR-01).
import { bkkToday } from "./time";

export type ReceivedDateProblem = "received_date_invalid" | "received_date_future" | "received_date_before_assigned";

const CE_DATE = /^(19|20)\d{2}-\d{2}-\d{2}$/;

/**
 * The earliest day that can be a received date. Not a "how far back" limit (Gate 1 Q2: none) but a guard against a typo
 * such as 1926: a day before 1970 would be a negative `submitted_at`, which the backup restore refuses (restore-validation),
 * so every later backup holding it could not be restored (review R-01 / QA B-01).
 */
export const MIN_RECEIVED_DATE = "2000-01-01";

/** A real Common-Era calendar day, years 1900–2099 — the same rule as `ceDate` of the assignment form (EP-05). */
export function isCeDate(v: unknown): v is string {
  if (typeof v !== "string" || !CE_DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
}

/** 12:00 Bangkok of `date` (= 05:00Z): "2026-10-30" → 1793336400000. */
export function bkkNoonMs(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 5);
}

/**
 * How far a device's clock may run ahead of the server's and its "today" still be accepted (correctness-lows AC-06 ·
 * C-03 R-03): a scan at 00:00:02 by the app's clock reaching the server at 23:59:59 is not a date in the future.
 * The day it allows is stored at `now` (receivedAtMs never goes past now), so nothing is ever dated after the server's clock.
 */
export const RECEIVED_DATE_CLOCK_SKEW_MS = 5 * 60_000;

/** The two days the server checks a received date against at `now`: its own Bangkok day, and the latest day allowed. */
export function receivedDateDays(now: number): { today: string; latest: string } {
  return { today: bkkToday(now), latest: bkkToday(now + RECEIVED_DATE_CLOCK_SKEW_MS) };
}

/**
 * Why `v` cannot be used as the received date — or null if it can. First match wins:
 * not a real CE day → invalid · after `latest` (default `today`) → future · before the work was given (only when the
 * assigned date is itself a real CE day not after `today` — a future / empty / Buddhist-era one is no floor, D-04) →
 * before_assigned. No limit on how far back (Gate 1 Q2) beyond MIN_RECEIVED_DATE. `today` = the server's Bangkok day at
 * the time of writing; the server passes `latest` = the day 5 minutes on (receivedDateDays), the screens don't.
 */
export function checkReceivedDate(v: unknown, o: { today: string; assignedDate: string | null; latest?: string }): ReceivedDateProblem | null {
  if (!isCeDate(v) || v < MIN_RECEIVED_DATE) return "received_date_invalid";
  if (v > (o.latest ?? o.today)) return "received_date_future";
  if (isCeDate(o.assignedDate) && o.assignedDate <= o.today && v < o.assignedDate) return "received_date_before_assigned";
  return null;
}

/**
 * The `submitted_at` for a cell received on `receivedDate` (BR-02): no date → `eventAt` (as before) · the Thai day of
 * `eventAt` itself → `eventAt` (the real time) · another day → noon of that day, never after `now`.
 * `eventAt` is the clamped client time, still used as `event_at`; the clamp never moves the chosen day (AC-06).
 */
export function receivedAtMs(receivedDate: string | null | undefined, eventAt: number, now: number): number {
  if (receivedDate == null) return eventAt;
  if (receivedDate === bkkToday(eventAt)) return eventAt;
  return Math.min(bkkNoonMs(receivedDate), now);
}
