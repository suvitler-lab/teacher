import { describe, it, expect } from "vitest";
import { excelFileName } from "@client/lib/excel";

describe("excelFileName", () => {
  it("never contains a path separator (a class like ป.6/1 and a term like 1/2569 have one)", () => {
    const n = excelFileName({ className: "ป.6/1", subjectName: "ทุกวิชา", periodLabel: "ภาคเรียนที่ 1/2569" });
    expect(n).toBe("สรุปงาน_ป.6-1_ทุกวิชา_ภาคเรียนที่1-2569.xlsx");
    expect(n).not.toMatch(/[\\/:*?"<>|]/);
  });
  it("keeps plain names as they were", () => {
    expect(excelFileName({ className: "ป.5", subjectName: "คณิต", periodLabel: "ก.ย.2569" })).toBe("สรุปงาน_ป.5_คณิต_ก.ย.2569.xlsx");
  });
});
