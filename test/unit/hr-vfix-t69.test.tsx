// @vitest-environment jsdom
// T-69 (verify round 1): the measured fixes. Real pixel numbers come from Chrome touch emulation (dev-notes/T-69.md);
// these tests pin the rules that produced them, so removing a rule fails a test.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/preact";
import { TermPicker } from "@client/components/ui";
import { terms, selectedTermId, currentTermId } from "@client/store";

afterEach(cleanup);
const css = (f: string) => readFileSync(`src/styles/${f}`, "utf8");

describe("T-69 verify fixes", () => {
  it("B-2/B-8: the term chip pays for the gear on touch (calendar icon off, gear flush) so no header wraps", () => {
    terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: "2026-05-16", end_date: "2027-03-31", updated_at: 0 }];
    currentTermId.value = selectedTermId.value = "t1";
    const { container } = render(<TermPicker />);
    expect(container.querySelector("label.pill.tp-pill")).not.toBeNull();
    const ui = css("ui.css");
    expect(ui).toMatch(/\.pill\.tp-pill > \.ti \{ display: none; \}/);
    expect(ui).toMatch(/margin-left: -5px/);
  });
  it("B-1: the gradebook table is fitted to tablets too, and the Excel note leaves the toolbar below 1200px", () => {
    expect(readFileSync("src/pages/Gradebook.tsx", "utf8")).toContain("(min-width: 721px)");
    expect(css("grade.css")).toMatch(/@media \(max-width: 1200px\) \{ \.gb-toolbar \.gb-export-scope:not\(\.warn\)/);
    expect(css("grade.css")).toMatch(/\.main:has\(\.gb-frame\) \{ padding-bottom: 0; \}/);
  });
  it("B-3: report table column is 1.55fr (58% +-1 at 1180 and 1536)", () => {
    expect(css("report.css")).toMatch(/\.rp-body\.lg \{ grid-template-columns: minmax\(0, 1\.55fr\) minmax\(0, 1fr\)/);
  });
  it("B-4: touch student rows use 3px padding; iPad upright meta line is two lines beside an icon-only reload", () => {
    const st = css("students.css");
    expect(st).toMatch(/\(pointer: coarse\) \{ \.stu-lrow \{ min-height: 56px; padding-top: 3px; padding-bottom: 3px; \}/);
    expect(st).toMatch(/\.stu-reload \.stu-rl \{ position: absolute/);
    expect(st).toMatch(/\.stu-lhead2 \{ position: static/); // AC-179: the title is not hidden
  });
  it("B-6/B-11: phone hero drops the legend and keeps 'ขาด n' together; disabled day is >= 0.72 opaque", () => {
    const a = css("attend.css");
    expect(a).toMatch(/\.att-hero \.att-hleg \{ display: none; \}/);
    expect(a).toMatch(/\.att-nw \{ white-space: nowrap; \}/);
    expect(a).toMatch(/\.att-week > button:disabled \{ opacity: 0\.72/);
    expect(readFileSync("src/components/attendance/AttHero.tsx", "utf8")).toContain('class="att-nw"');
  });
});
