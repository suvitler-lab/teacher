// @vitest-environment jsdom
// T-73 (Verify 1/3): B-7 term chip on a phone, B-6 attendance hero on a phone, B-73b report name button tap size.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/preact";
import { readFileSync } from "node:fs";
import { TermPicker } from "@client/components/ui";
import { terms, selectedTermId, currentTermId } from "@client/store";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const T = [
  { id: "t2", year: 2569, term: 2, name: "ภาคเรียนที่ 2/2569", is_current: true, start_date: "2026-11-01", end_date: "2027-03-31", updated_at: 0 },
  { id: "t1", year: 2569, term: 1, name: "ภาคเรียนที่ 1/2569", is_current: false, start_date: "2026-05-16", end_date: "2026-10-31", updated_at: 0 },
];
const setup = (narrow: boolean) => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: narrow && /max-width: 720px/.test(q), media: q, addEventListener() {}, removeEventListener() {} }));
  terms.value = T as never; currentTermId.value = selectedTermId.value = "t2";
  return render(<TermPicker />);
};

describe("B-7 term chip", () => {
  it("phone: the name is whole, a dot marks 'current', the full words stay in aria-label and title", () => {
    setup(true);
    const cur = screen.getByRole("option", { name: "ภาคเรียนที่ 2/2569 · ปัจจุบัน" }) as HTMLOptionElement;
    expect(cur.textContent).toBe("ภาคเรียนที่ 2/2569 ●");
    expect(cur.textContent).not.toContain("ปัจจุบัน");
    expect(cur.title).toBe("ภาคเรียนที่ 2/2569 · ปัจจุบัน");
    expect((screen.getByRole("combobox", { name: "ภาคเรียนที่แสดง" }) as unknown as HTMLSelectElement).title).toContain("ปัจจุบัน");
  });
  it("wide screen: the words stay as before", () => {
    setup(false);
    expect(screen.getByRole("option", { name: "ภาคเรียนที่ 2/2569 · ปัจจุบัน" }).textContent).toBe("ภาคเรียนที่ 2/2569 · ปัจจุบัน");
    expect(screen.getByText("ภาคเรียนที่ 1/2569").textContent).toBe("ภาคเรียนที่ 1/2569"); // a past term has no marker at all
  });
  it("home header: the chip row comes first and the date never breaks (css)", () => {
    const h = readFileSync("src/styles/home.css", "utf8");
    expect(h).toMatch(/\.hm-top-act \{ order: 1; flex: 1 1 100%/);
    expect(h).toMatch(/\.hm-top-date \{ white-space: nowrap; \}/);
  });
});

describe("B-6 attendance hero on a phone", () => {
  it("the day-kind and method switches live in their own row under the hero, not in it", () => {
    const a = readFileSync("src/pages/Attendance.tsx", "utf8");
    expect(a).toContain("{!phone && modeSegs}");
    expect(a).toMatch(/\{phone && <div class="att-modes">\{modeSegs\}<\/div>\}/);
    const css = readFileSync("src/styles/attend.css", "utf8");
    expect(css).toMatch(/\.att-modes \{ display: grid;/);
    expect(css).toMatch(/\.att-modes \.seg button \{[^}]*white-space: nowrap/);
  });
});

describe("B-73b report name button", () => {
  it("keeps the full tap size on touch even inside the phone card (declared after the container rules)", () => {
    const r = readFileSync("src/styles/report.css", "utf8");
    const i = r.indexOf("@media (pointer: coarse) { .rp-body:not(.lg) .rp-namebtn { min-height: var(--tap); } }");
    expect(i).toBeGreaterThan(r.lastIndexOf("@container rp (max-width: 26rem)"));
    expect(r).not.toMatch(/\.rp-namebtn \{ min-height: 28px/);
  });
});
