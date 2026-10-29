import type { Env } from "../env";
import { abortIf } from "./guard";

export interface StudentMove { studentId: string; toClassId: string | null }
export interface BlockedStudentMove extends StudentMove {
  code: string;
  fromClassId: string | null;
  reason: "cross_year" | "has_history";
}

// Students currently have ONE class_id, not enrollment history. Moving that row would remove the
// child and their marks from old reports. Keep this rule in SQL so the check and write are atomic.
const CURRENT_YEAR = "(SELECT year FROM terms WHERE is_current = 1 LIMIT 1)";
const CROSS_YEAR = `old.id IS NOT NULL AND dest.id IS NOT NULL AND
  COALESCE(old.year, ${CURRENT_YEAR}) IS NOT COALESCE(dest.year, ${CURRENT_YEAR})`;
const BLOCKED_MOVES = `SELECT s.id AS studentId, s.code, s.class_id AS fromClassId,
    json_extract(j.value, '$.toClassId') AS toClassId,
    CASE WHEN ${CROSS_YEAR} THEN 'cross_year' ELSE 'has_history' END AS reason
  FROM json_each(?1) j JOIN students s ON s.id = json_extract(j.value, '$.studentId')
  LEFT JOIN classes old ON old.id = s.class_id
  LEFT JOIN classes dest ON dest.id = json_extract(j.value, '$.toClassId')
  WHERE s.class_id IS NOT json_extract(j.value, '$.toClassId')
    AND ((${CROSS_YEAR})
      OR EXISTS (SELECT 1 FROM submissions sub WHERE sub.student_id = s.id)
      OR EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = s.id))`;

export async function blockedStudentMoves(env: Env, moves: StudentMove[]): Promise<BlockedStudentMove[]> {
  if (moves.length === 0) return [];
  const res = await env.DB.prepare(BLOCKED_MOVES).bind(JSON.stringify(moves)).all<BlockedStudentMove>();
  return res.results ?? [];
}

export function studentHistoryGuard(env: Env, moves: StudentMove[]) {
  return abortIf(env, `EXISTS (${BLOCKED_MOVES})`, JSON.stringify(moves));
}

export const HISTORY_MOVE_MESSAGE = "ย้ายนักเรียนข้ามปีหรือมีประวัติแล้วไม่ได้ เพราะจะทำให้รายงานเดิมเปลี่ยน — เก็บนักเรียนไว้ในห้องเดิมก่อน";
