// @vitest-environment jsdom
// T-75: pins the CSS/DOM rules behind the three Gate V fixes (real numbers: dev-notes/T-75.md).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const css = (f: string) => readFileSync(`src/styles/${f}`, "utf8");
const src = (f: string) => readFileSync(f, "utf8");

describe("T-75", () => {
  it("long work titles clamp to 2 lines in CSS and keep the full text in DOM + title", () => {
    expect(css("home.css")).toMatch(/\.hm-asg \.ttl, \.hma-due-h \.ttl, \.sc-asg \.ttl \{[^}]*-webkit-line-clamp: 2[^}]*overflow: hidden/);
    expect(src("src/components/home/cards.tsx")).toContain('class="ttl" title={a.assignment.title}>{a.assignment.title}');
    expect(src("src/components/home/a/Cards.tsx")).toContain('title={g.assignment.title}>{g.assignment.title}');
    expect(src("src/components/scan/SessionSetup.tsx")).toContain('title={a.title}>{a.title}');
  });
  it("touch 721-819px headers: action labels off, report subtitle ellipsis", () => {
    const ui = css("ui.css");
    expect(ui).toMatch(/\(pointer: coarse\) and \(min-width: 721px\) and \(max-width: 819px\) \{[^]*\.uh-act \.att-hide-sm \{ display: none; \}/);
    expect(ui).toMatch(/\.rp-page > \.uh > \.uh-l \{ flex: 1 1 11rem; min-width: 0; \}/);
  });
  it("disabled buttons keep dashed + .72 opacity with primary text colour", () => {
    expect(css("attend.css")).toMatch(/\.att-week > button:disabled \{ opacity: 0\.72; border-style: dashed/);
    expect(css("attend.css")).toMatch(/button:disabled \.ws \{ color: var\(--text-primary\); \}/);
    expect(css("students.css")).toMatch(/\.stu-tile:disabled, \.stu-tile:disabled \.ts \{ color: var\(--text-primary\); \}/);
  });
});
