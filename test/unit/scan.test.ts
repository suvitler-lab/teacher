import { describe, it, expect } from "vitest";
import { buildIndex, resolveScan, normalizeScan } from "@shared/scan";
import type { Student } from "@shared/types";

function stu(p: Partial<Student>): Student {
  return {
    id: "s", code: "101", qr_token: "Q-AAAAAAAAAA", prefix: null, first_name: "ก",
    last_name: "ข", nickname: null, class_id: "c1", number: 1, status: "active", left_at: null, updated_at: 0, ...p,
  };
}

const students = [
  stu({ id: "s1", code: "10501", qr_token: "Q-7K3M9QX2TD", number: 1 }),
  stu({ id: "s2", code: "10502", qr_token: "Q-ABCDEFGHJK", number: 2 }),
];
const idx = buildIndex(students, { "Q-9XYZ012345": "s1" }, "c1");

describe("normalizeScan", () => {
  it("extracts a token from a URL", () => {
    expect(normalizeScan("https://x.example/s/Q-7K3M9QX2TD")).toBe("Q-7K3M9QX2TD");
    expect(normalizeScan("https://x.example/?s=Q-7K3M9QX2TD")).toBe("Q-7K3M9QX2TD");
  });
  it("strips CR/LF that scanners append", () => {
    expect(normalizeScan("Q-7K3M9QX2TD\r\n")).toBe("Q-7K3M9QX2TD");
  });
  it("uppercases tokens (survives caps lock)", () => {
    expect(normalizeScan("q-7k3m9qx2td")).toBe("Q-7K3M9QX2TD");
  });
  it("repairs Thai-layout digits", () => {
    // "ๅภถ" are the Thai glyphs on the 1,2,3 keys
    expect(normalizeScan("ๅภถ")).toBe("123");
  });
});

describe("resolveScan precedence", () => {
  it("resolves an active token to its student", () => {
    expect(resolveScan("Q-7K3M9QX2TD", idx)).toMatchObject({ kind: "student", studentId: "s1" });
  });
  it("flags a revoked token", () => {
    expect(resolveScan("Q-9XYZ012345", idx)).toMatchObject({ kind: "revoked", studentId: "s1" });
  });
  it("does not accept a student code unless allowed", () => {
    expect(resolveScan("10502", idx).kind).toBe("not_found");
    expect(resolveScan("10502", idx, { allowStudentCode: true })).toMatchObject({ kind: "student", studentId: "s2" });
  });
  it("treats 1-2 digits as a class number", () => {
    expect(resolveScan("2", idx)).toMatchObject({ kind: "number", studentId: "s2" });
  });
  it("returns not_found for unknown tokens", () => {
    expect(resolveScan("Q-ZZZZZZZZZZ", idx).kind).toBe("not_found");
  });

  it("a class number two students share is AMBIGUOUS — both offered, none picked", () => {
    const dup = [
      stu({ id: "d1", code: "1", qr_token: "Q-DUPLICATE01", number: 5 }),
      stu({ id: "d2", code: "2", qr_token: "Q-DUPLICATE02", number: 5 }),
      stu({ id: "d3", code: "3", qr_token: "Q-DUPLICATE03", number: 6 }),
    ];
    const i = buildIndex(dup, {}, "c1");
    const r = resolveScan("5", i);
    expect(r.kind).toBe("ambiguous");
    expect(r.studentId).toBeUndefined();
    expect(r.candidateIds).toEqual(["d1", "d2"]);
    // the order of the list can't change the answer
    expect(resolveScan("5", buildIndex([...dup].reverse(), {}, "c1")).candidateIds?.sort()).toEqual(["d1", "d2"]);
    // a number only one student has still resolves
    expect(resolveScan("6", i)).toMatchObject({ kind: "number", studentId: "d3" });
  });

  it("a moved-out student's number does not collide with the active one", () => {
    const list = [
      stu({ id: "old", code: "1", qr_token: "Q-MOVEDOUT001", number: 5, status: "moved" }),
      stu({ id: "now", code: "2", qr_token: "Q-STILLHERE01", number: 5 }),
    ];
    expect(resolveScan("5", buildIndex(list, {}, "c1"))).toMatchObject({ kind: "number", studentId: "now" });
  });
});
