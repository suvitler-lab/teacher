import type { AttendanceStatus } from "./types";

export const ATTENDANCE_CYCLE: AttendanceStatus[] = ["present", "late", "leave", "sick", "absent"];

/**
 * Status a tile should show after a tap.
 * First tap (no status yet) marks the student present; further taps cycle
 * present → late → leave → sick → absent → present.
 */
export function nextStatus(cur?: AttendanceStatus): AttendanceStatus {
  if (!cur) return "present";
  const i = ATTENDANCE_CYCLE.indexOf(cur);
  return ATTENDANCE_CYCLE[(i + 1) % ATTENDANCE_CYCLE.length];
}
