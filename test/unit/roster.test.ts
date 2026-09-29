import { describe, it, expect } from "vitest";
import { classInYear, inRoster, rosterOf } from "@shared/roster";

const term = { year: 2569, end_date: "2026-09-30" };

describe("classInYear", () => {
  it("a class belongs to its own year only; a legacy class (no year) belongs to every year", () => {
    expect(classInYear(2569, 2569)).toBe(true);
    expect(classInYear(2569, 2570)).toBe(false);
    expect(classInYear(null, 2570)).toBe(true);
    expect(classInYear(undefined, 2569)).toBe(true);
  });
});

describe("inRoster", () => {
  it("counts children who are active or finished the year in the class", () => {
    expect(inRoster({ status: "active" }, term)).toBe(true);
    expect(inRoster({ status: "finished" }, term)).toBe(true);
  });

  it("counts a child who left AFTER the term ended (they were there for all of it), not one who left during it", () => {
    expect(inRoster({ status: "moved", left_at: "2026-11-10" }, term)).toBe(true);
    expect(inRoster({ status: "moved", left_at: "2026-09-30" }, term)).toBe(false); // left on the last day: not there for all of it
    expect(inRoster({ status: "inactive", left_at: "2026-08-01" }, term)).toBe(false);
  });

  it("a mover with no recorded day is not counted anywhere (we don't know when they left)", () => {
    expect(inRoster({ status: "moved" }, term)).toBe(false);
    expect(inRoster({ status: "moved", left_at: null }, term)).toBe(false);
  });

  it("a term with no end date only counts children who are in the class", () => {
    expect(inRoster({ status: "moved", left_at: "2030-01-01" }, { year: 2569, end_date: null })).toBe(false);
    expect(inRoster({ status: "active" }, { year: 2569, end_date: null })).toBe(true);
  });

  it("with no term ('not assigned to a term yet') only children in the class today count", () => {
    expect(inRoster({ status: "active" }, null)).toBe(true);
    expect(inRoster({ status: "finished" }, null)).toBe(false);
    expect(inRoster({ status: "moved", left_at: "2030-01-01" }, null)).toBe(false);
  });
});

describe("rosterOf", () => {
  const stu = (id: string, class_id: string, number: number, status: string, left_at: string | null = null) =>
    ({ id, class_id, number, status, left_at });
  const all = [
    stu("a", "c1", 3, "active"),
    stu("b", "c1", 1, "finished"),
    stu("c", "c1", 2, "moved", "2026-08-01"),
    stu("d", "c2", 1, "active"),
  ];

  it("lists a class's children in class-number order, by the term's rule", () => {
    expect(rosterOf(all, "c1", 2569, term).map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("is empty for a class that belongs to another year", () => {
    expect(rosterOf(all, "c1", 2570, term)).toEqual([]);
  });
});
