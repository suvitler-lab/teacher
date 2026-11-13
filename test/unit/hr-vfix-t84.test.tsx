// @vitest-environment jsdom
// T-84 (verify round 2): rules behind the 3 measured fixes (numbers in dev-notes/T-84.md). Removing a rule fails a test.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = (f: string) => readFileSync(`src/styles/${f}`, "utf8");

describe("T-84 verify fixes", () => {
  it("B-H1: gradebook toolbar keeps one row (nav shrinks, no scrollbar, no wrapped label) and the work bar hides button labels under 900px", () => {
    const g = css("grade.css");
    expect(g).toMatch(/\.gb-toolbar \.gb-nav \{ gap: 6px; scrollbar-width: none; \}/);
    expect(g).toMatch(/\.gb-toolbar \.gb-nav-lbl \{ white-space: nowrap; flex: none; \}/);
    expect(g).toMatch(/\.gb-toolbar \.gb-jump \{ padding: 0 0\.6rem; min-height: 2\.13rem; height: 2\.13rem; \}/);
    expect(g).toMatch(/@media \(pointer: coarse\) and \(min-width: 901px\) and \(max-width: 1400px\) \{\s*\.gb-toolbar \.gb-nav \{ flex: 1 1 0; min-width: 0; flex-wrap: nowrap;/);
    expect(g).toMatch(/\.gb-toolbar \.gb-export \.gb-export-lbl \{ display: none; \}/);
    expect(g).toMatch(/@media \(max-width: 900px\) \{ \.gb-wb \.gb-bl \{ display: none; \} \}/);
  });
  it("B-H2: the timeline row title is clamped to 2 lines and keeps its full text in title=; the scan start bar title too", () => {
    expect(css("home-a.css")).toMatch(/\.hma-body h3 \{[^}]*-webkit-line-clamp: 2;[^}]*overflow: hidden;/);
    expect(readFileSync("src/components/home/a/Timeline.tsx", "utf8")).toContain("<h3 title={row.title}>{row.title}</h3>");
    expect(css("ui.css")).toMatch(/\.sc-startbar \.sb-t b \{[^}]*-webkit-line-clamp: 2;[^}]*overflow: hidden;/);
  });
  it("B-H3: a disabled student tile says 'off' with a dashed edge and flat surface, never with opacity < 1 on the text", () => {
    const s = css("students.css");
    const rule = s.match(/\.stu-tile:disabled \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/opacity: 1;/);
    expect(rule).toMatch(/border-style: dashed;/);
    expect(rule).toMatch(/background: var\(--surface-1\);/);
    expect(s).not.toMatch(/\.stu-tile:disabled \{[^}]*opacity: \.[0-9]/);
    expect(s).toMatch(/\.stu-tile:disabled \.tl, \.stu-tile:disabled \.tv[^{]*\{ color: var\(--text-primary\); \}/);
  });
});
