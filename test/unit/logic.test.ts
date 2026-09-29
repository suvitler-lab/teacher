import { describe, it, expect } from "vitest";
import { nextStatus } from "@shared/attendance";
import { decideCellCommit } from "@shared/grade";
import { classifyFailure } from "@shared/failure";

describe("nextStatus", () => {
  it("first tap marks present, not late", () => {
    expect(nextStatus(undefined)).toBe("present");
  });
  it("cycles present -> late -> leave -> sick -> absent -> present", () => {
    expect(nextStatus("present")).toBe("late");
    expect(nextStatus("late")).toBe("leave");
    expect(nextStatus("leave")).toBe("sick");
    expect(nextStatus("sick")).toBe("absent");
    expect(nextStatus("absent")).toBe("present");
  });
});

describe("decideCellCommit", () => {
  const submitted10 = { status: "submitted" as const, score: 10 };
  const awaiting = { status: "submitted" as const, score: null };

  it("no change is a noop (blur after opening an empty cell)", () => {
    expect(decideCellCommit("", "", undefined, 10)).toEqual({ kind: "noop" });
    expect(decideCellCommit("10", "10", submitted10, 10)).toEqual({ kind: "noop" });
  });
  it("blanking a cell that had a score clears it back to awaiting", () => {
    expect(decideCellCommit("10", "", submitted10, 10)).toEqual({ kind: "clear" });
  });
  it("blanking an awaiting/empty cell does nothing", () => {
    expect(decideCellCommit("", "", awaiting, 10)).toEqual({ kind: "noop" });
  });
  it("accepts integers and half points", () => {
    expect(decideCellCommit("", "8", undefined, 10)).toEqual({ kind: "set", score: 8 });
    expect(decideCellCommit("", "7.5", undefined, 10)).toEqual({ kind: "set", score: 7.5 });
    expect(decideCellCommit("", "0", undefined, 10)).toEqual({ kind: "set", score: 0 });
  });
  it("rejects out-of-range and non-half fractions", () => {
    expect(decideCellCommit("", "7.3", undefined, 10).kind).toBe("error");
    expect(decideCellCommit("", "11", undefined, 10).kind).toBe("error");
    expect(decideCellCommit("", "-1", undefined, 10).kind).toBe("error");
    expect(decideCellCommit("", "abc", undefined, 10).kind).toBe("error");
  });
});

describe("classifyFailure", () => {
  it("keeps transient failures in the queue", () => {
    for (const s of [0, 500, 502, 423, 429]) expect(classifyFailure(s)).toBe("retry");
  });
  it("treats 401 as auth", () => {
    expect(classifyFailure(401)).toBe("auth");
  });
  it("treats other 4xx (validation/conflict) as permanent", () => {
    for (const s of [400, 409, 422]) expect(classifyFailure(s)).toBe("failed");
  });
});
