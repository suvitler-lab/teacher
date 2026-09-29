import type {
  Term,
  Class,
  Subject,
  WorkType,
  Student,
  Assignment,
} from "@shared/types";

const b = (v: unknown) => v === 1 || v === "1" || v === true;

export function mapTerm(r: any): Term {
  return {
    id: r.id,
    year: r.year,
    term: r.term,
    name: r.name,
    is_current: b(r.is_current),
    start_date: r.start_date ?? null,
    end_date: r.end_date ?? null,
    updated_at: r.updated_at,
  };
}

export function mapClass(r: any): Class {
  return {
    id: r.id,
    name: r.name,
    grade: r.grade ?? null,
    sort: r.sort,
    archived: b(r.archived),
    year: r.year ?? null,
    updated_at: r.updated_at,
  };
}

export function mapSubject(r: any): Subject {
  return {
    id: r.id,
    code: r.code ?? null,
    name: r.name,
    color: r.color,
    sort: r.sort,
    archived: b(r.archived),
    updated_at: r.updated_at,
  };
}

export function mapWorkType(r: any): WorkType {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    is_exam: b(r.is_exam),
    default_full: r.default_full,
    sort: r.sort,
    archived: b(r.archived),
    updated_at: r.updated_at,
  };
}

export function mapStudent(r: any): Student {
  return {
    id: r.id,
    code: r.code,
    qr_token: r.qr_token,
    prefix: r.prefix ?? null,
    first_name: r.first_name,
    last_name: r.last_name,
    nickname: r.nickname ?? null,
    class_id: r.class_id ?? null,
    number: r.number ?? null,
    status: r.status,
    left_at: r.left_at ?? null,
    updated_at: r.updated_at,
  };
}

export function mapAssignment(r: any, classIds: string[]): Assignment {
  return {
    id: r.id,
    term_id: r.term_id ?? null,
    subject_id: r.subject_id ?? null,
    type_id: r.type_id ?? null,
    title: r.title,
    unit: r.unit ?? null,
    full_score: r.full_score,
    assigned_date: r.assigned_date ?? null,
    due_date: r.due_date ?? null,
    note: r.note ?? null,
    publish_scores: b(r.publish_scores),
    status: r.status,
    class_ids: classIds,
    created_at: r.created_at,
    updated_at: r.updated_at,
    deleted_at: r.deleted_at ?? null,
  };
}
