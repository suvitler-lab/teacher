// AC-04: text size must follow the user's setting, so no fixed px font-size anywhere in the app
// (rem / var(--fs-*) only). `max(13px, ...)` is the allowed floor that keeps text readable at 14px.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = join(__dirname, "../../src");

// file (relative to src, forward slashes) -> reason it may keep a fixed value
const EXEMPT: Record<string, string> = {
  "styles/print.css": "print units are separate from screen sizing; also checked below to hold only @media print rules",
  "styles/stickers.css": "QR sticker preview mirrors the printed sticker size (mm), not the app text size",
};

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(css|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

// font-size: 12px / fontSize: "12px" / fontSize: 12 (numeric px in JSX style objects)
const DECL = /(font-size\s*:\s*((?:\$\{[^}]*\}|[^;}"'`])+))|(fontSize\s*:\s*(["'`]?)([^,}\n]+))/g;

function offenders(text: string): string[] {
  const bad: string[] = [];
  for (const m of text.matchAll(DECL)) {
    const raw = (m[2] ?? m[5] ?? "").trim();
    const value = raw.replace(/max\(\s*13px\s*,/g, "max(");
    if (/(\d|\})\s*px\b/.test(value) || /^\d+(\.\d+)?$/.test(value.replace(/["'`]/g, ""))) bad.push(m[0].trim());
  }
  return bad;
}

describe("no fixed font-size in the app", () => {
  const files = walk(root).filter((f) => !(relative(root, f).split(sep).join("/") in EXEMPT));
  it("scans a meaningful number of files", () => { expect(files.length).toBeGreaterThan(20); });
  it("has no px font-size in css or inline styles", () => {
    const found: string[] = [];
    for (const f of files) for (const o of offenders(readFileSync(f, "utf8"))) found.push(`${relative(root, f)}: ${o}`);
    expect(found).toEqual([]);
  });
  it("print.css holds nothing outside @media print", () => {
    const css = readFileSync(join(root, "styles/print.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const start = css.indexOf("@media print");
    expect(start).toBeGreaterThanOrEqual(0);
    let depth = 0, end = -1;
    for (let i = css.indexOf("{", start); i < css.length; i++) {
      if (css[i] === "{") depth++;
      if (css[i] === "}" && --depth === 0) { end = i; break; }
    }
    expect((css.slice(0, start) + css.slice(end + 1)).trim()).toBe("");
  });
  it("the detector itself flags px values", () => {
    expect(offenders("a{font-size: 12px}")).toHaveLength(1);
    expect(offenders('<i style="font-size:13px;x:1">')).toHaveLength(1);
    expect(offenders("{ fontSize: 14 }")).toHaveLength(1);
    expect(offenders("`font-size:${n}px`")).toHaveLength(1);
    expect(offenders("a{font-size: max(13px, 0.85rem)}")).toHaveLength(0);
    expect(offenders("a{font-size: 1.2rem}")).toHaveLength(0);
  });
});
