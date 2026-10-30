// Verify 1 R-02: the "clear" confirm box counts only the cells the server will really clear —
// not void (nothing to clear) and not excused (whole-class buttons never touch excused, BR-07).
import { describe, it, expect } from "vitest";
import { clearableCount } from "../../src/pages/Gradebook";

describe("R-02 clearableCount", () => {
  it("counts submitted cells only: excused, void and empty cells are left out", () => {
    const cells = [
      { status: "submitted" }, { status: "submitted" }, { status: "excused" }, { status: "void" }, undefined,
    ];
    expect(clearableCount(cells)).toBe(2);
    expect(clearableCount([undefined, { status: "excused" }])).toBe(0);
  });
});
