// T-29 (AC-34, AC-37, BR-10): the 6 colour sets (3 skins x light/dark) in src/styles/tokens.css — every token that
// pages read exists in every set, and the text / icon / border pairs meet the contrast the design promises.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const text = readFileSync(path.resolve(__dirname, "../../src/styles/tokens.css"), "utf8");
type Vars = Record<string, string>;

/** The declarations of every rule whose selector list matches, in file order (later rules win). */
function rules(): { sel: string; vars: Vars; media: boolean }[] {
  const out: { sel: string; vars: Vars; media: boolean }[] = [];
  const noComments = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /(@media[^{]*\{\s*)?([^{}@]+)\{([^{}]*)\}/g;
  for (const m of noComments.matchAll(re)) {
    const vars: Vars = {};
    for (const d of m[3].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim();
    out.push({ sel: m[2].trim(), vars, media: !!m[1] });
  }
  return out;
}

/** What an element on `<html data-skin=skin data-theme=mode>` sees (the system scheme is off, so media rules are skipped). */
function resolved(skin: string, mode: "light" | "dark"): Vars {
  const all: Vars = {};
  for (const r of rules()) {
    if (r.media) continue;
    const hit = r.sel.split(",").some((s) => {
      s = s.trim();
      if (s === ":root") return true;
      if (s === `:root[data-theme="${mode}"]`) return true;
      const mSkin = /^:root(?::not\(\[data-skin\]\)|\[data-skin="(\w+)"\])(.*)$/.exec(s);
      if (!mSkin) return false;
      if (mSkin[1] ? mSkin[1] !== skin : skin !== "warm") return false;
      const rest = mSkin[2];
      if (rest === "") return true;
      if (rest === ':not([data-theme="dark"])') return mode === "light";
      if (rest === '[data-theme="dark"]') return mode === "dark";
      return false;
    });
    if (hit) Object.assign(all, r.vars);
  }
  return all;
}

function toRgb(css: string, over?: [number, number, number]): [number, number, number, number] {
  css = css.trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css);
  if (m) {
    const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  m = /^rgba?\(([^)]+)\)$/.exec(css);
  if (m) { const p = m[1].split(",").map((x) => parseFloat(x)); return [p[0], p[1], p[2], p[3] ?? 1]; }
  throw new Error("colour not understood: " + css + (over ? "" : ""));
}
/** A colour that may be translucent, laid on `under`. */
function flat(css: string, under: [number, number, number]): [number, number, number] {
  const [r, g, b, a] = toRgb(css);
  return [r * a + under[0] * (1 - a), g * a + under[1] * (1 - a), b * a + under[2] * (1 - a)];
}
const lum = ([r, g, b]: [number, number, number]) => {
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: [number, number, number], b: [number, number, number]) => {
  const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
  return (hi + 0.05) / (lo + 0.05);
};

const SKINS = ["pro", "warm", "playful"] as const;
const MODES = ["light", "dark"] as const;
const sets = SKINS.flatMap((s) => MODES.map((m) => ({ name: `${s} ${m}`, v: resolved(s, m) })));

const REQUIRED = [
  "surface-0", "surface-1", "surface-2", "surface-3", "text-primary", "text-secondary", "text-muted", "border", "border-strong", "border-control", "card-border",
  "accent", "accent-hover", "on-accent", "bg-accent", "text-accent", "accent-2", "on-accent-2", "hero-bg", "hero-fg", "hero-muted", "hero-chip",
  "bg-success", "text-success", "fill-success", "on-success", "bg-warning", "text-warning", "fill-warning", "on-warning", "bg-danger", "text-danger", "fill-danger", "on-danger",
  "att-present", "att-late", "att-leave", "att-sick", "att-absent", "cls-1", "cls-2", "cls-3", "illo-1", "illo-2", "illo-3", "illo-4",
  "rail-bg", "rail-fg", "rail-active-bg", "rail-active-fg", "rail-label", "ring-track", "ink", "shadow-card", "shadow-pop",
  "font-sans", "font-display", "display-weight", "display-track", "font-num", "radius-xs", "radius-sm", "radius", "radius-lg", "radius-btn", "radius-hero", "card-bw", "btn-bw", "density",
  "border-accent", "border-success", "border-warning", "border-danger", "bg-accent-muted", "fill-accent",
];

describe("token sets", () => {
  it("there are 6 and each defines every token the pages and the new design read", () => {
    expect(sets).toHaveLength(6);
    for (const s of sets) {
      const missing = REQUIRED.filter((k) => !(`--${k}` in s.v));
      expect(missing, s.name).toEqual([]);
    }
  });
  it("the default (no data-skin) is the warm skin", () => {
    const none = (mode: "light" | "dark") => {
      const all: Vars = {};
      for (const r of rules()) {
        if (r.media) continue;
        const hit = r.sel.split(",").some((s) => {
          s = s.trim();
          return s === ":root" || s === `:root[data-theme="${mode}"]` || s === ":root:not([data-skin])" || (mode === "light" && s === ':root:not([data-skin]):not([data-theme="dark"])') || (mode === "dark" && s === ':root:not([data-skin])[data-theme="dark"]');
        });
        if (hit) Object.assign(all, r.vars);
      }
      return all;
    };
    expect(none("light")["--surface-0"]).toBe(resolved("warm", "light")["--surface-0"]);
    expect(none("dark")["--accent"]).toBe(resolved("warm", "dark")["--accent"]);
  });
  it("each skin has its own fonts, and display weight/track are set", () => {
    expect(resolved("pro", "light")["--font-sans"]).toContain("IBM Plex Sans Thai");
    expect(resolved("warm", "light")["--font-sans"]).toContain("Sarabun");
    expect(resolved("warm", "light")["--font-display"]).toContain("Mitr");
    expect(resolved("playful", "light")["--font-sans"]).toContain("Anuphan");
    expect(resolved("playful", "light")["--font-display"]).toContain("Mali");
    for (const s of sets) expect(s.v["--font-sans"], s.name).toMatch(/system-ui/);
  });
  it("the system-dark rule gives the same dark values as the explicit dark rule", () => {
    for (const skin of SKINS) {
      const sys = rules().filter((r) => r.media && r.sel.includes(skin === "warm" ? ':root[data-skin="warm"]:not([data-theme="light"])' : `:root[data-skin="${skin}"]:not([data-theme="light"])`));
      expect(sys.length, skin).toBe(1);
      const dark = resolved(skin, "dark");
      for (const [k, v] of Object.entries(sys[0].vars)) expect(dark[k], `${skin} ${k}`).toBe(v);
    }
  });
});

describe("contrast (AC-37)", () => {
  for (const { name, v } of sets) {
    const rgb = (k: string, under?: [number, number, number]) => flat(v["--" + k], under ?? [0, 0, 0]);
    const s0 = () => rgb("surface-0"), s1 = () => rgb("surface-1"), s2 = () => rgb("surface-2");
    it(`${name}: body text >= 4.5 on the page and cards`, () => {
      for (const t of ["text-primary", "text-secondary", "text-muted"]) {
        for (const bg of [s0(), s1(), s2()]) expect(ratio(rgb(t), bg), `${t}`).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${name}: accent text, button text and status text >= 4.5`, () => {
      expect(ratio(rgb("text-accent"), s2())).toBeGreaterThanOrEqual(4.5);
      expect(ratio(rgb("text-accent"), flat(v["--bg-accent"], s2()))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(rgb("on-accent"), rgb("accent"))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(rgb("on-accent-2"), rgb("accent-2"))).toBeGreaterThanOrEqual(4.5);
      for (const k of ["success", "warning", "danger"]) {
        expect(ratio(rgb("text-" + k), rgb("bg-" + k)), k).toBeGreaterThanOrEqual(4.5);
        // on-* is laid on fill-*: as TEXT on the danger button (base.css, Gradebook) it needs 4.5; as an icon in the
        // success / warning badges (scan.css) 3 is the rule
        expect(ratio(rgb("on-" + k), rgb("fill-" + k)), `on-${k} on fill-${k}`).toBeGreaterThanOrEqual(k === "danger" ? 4.5 : 3);
      }
    });
    it(`${name}: edges of buttons and inputs >= 3 on the card`, () => {
      expect(ratio(flat(v["--border-control"], s2()), s2())).toBeGreaterThanOrEqual(3);
    });
    it(`${name}: hero, menu and focus colours >= 4.5`, () => {
      expect(ratio(rgb("hero-fg"), rgb("hero-bg"))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(rgb("hero-muted"), rgb("hero-bg"))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(rgb("rail-fg"), rgb("rail-bg"))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(rgb("rail-label"), rgb("rail-bg"))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(rgb("rail-active-fg"), rgb("rail-active-bg"))).toBeGreaterThanOrEqual(4.5);
      // shell.css: a hovered rail item is rail-fg 14% over rail-bg, text stays rail-fg
      const hover = flat(`rgba(${rgb("rail-fg").join(",")},.14)`, rgb("rail-bg"));
      expect(ratio(rgb("rail-fg"), hover)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
