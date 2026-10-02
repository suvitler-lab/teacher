import { describe, it, expect } from "vitest";
import { describeAudit } from "../../src/lib/auditText";

describe("history wording", () => {
  it("attendance statuses are Thai, never the stored English word", () => {
    expect(describeAudit({ entity: "attendance", action: "update", after: { status: "present" } })).toBe("เช็คชื่อ: มา");
    expect(describeAudit({ entity: "attendance", action: "update", after: { status: "sick" } }, true)).toBe("สถานะ: ป่วย");
    expect(describeAudit({ entity: "attendance", action: "update" })).toBe("เช็คชื่อ: -");
  });
  it("hiding or showing scores is named, other edits stay 'edited'", () => {
    expect(describeAudit({ entity: "assignment", action: "update", before: { publish_scores: true }, after: { publish_scores: false } })).toBe("ซ่อนคะแนน");
    expect(describeAudit({ entity: "assignment", action: "update", before: { publish_scores: false }, after: { publish_scores: true } })).toBe("แสดงคะแนน");
    expect(describeAudit({ entity: "assignment", action: "update", before: { title: "ก", full_score: 10 }, after: { title: "ข", full_score: 10, class_ids: ["c1"] } })).toBe("แก้ไขงาน");
    expect(describeAudit({ entity: "assignment", action: "create" })).toBe("สร้างงาน");
  });
  it("score changes read as before → after", () => {
    expect(describeAudit({ entity: "submission", action: "update", before: { score: 3 }, after: { score: 9 } })).toBe("คะแนน 3 → 9");
  });
});
