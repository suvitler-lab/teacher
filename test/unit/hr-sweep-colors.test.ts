// T-30 (AC-34, AC-37, BR-10): the page stylesheets that were not rebuilt use colour tokens only, and every
// "text colour on background colour" pair declared in them meets the contrast the design promises in all 6 sets.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const dir = path.resolve(__dirname, "../../src/styles");
const FILES = ["attend", "grade", "random", "report", "scan", "students", "settings-cards", "stickers", "print", "projector", "onboarding", "ui"];
const read = (f: string) => readFileSync(path.join(dir, f + ".css"), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

// ---- 1. no fixed colours left (except where the colour is fixed on purpose: paper, camera view, projector palette) ----
/** per file: selector prefixes whose rules may keep fixed colours (each has a comment with the reason in the css) */
const ALLOWED: Record<string, RegExp[]> = {
  print: [/./], // printed output: black on white
  stickers: [/^\.sheet$/, /^\.qr-card( \.(school|meta))?$/], // printed sticker sheet
  projector: [/^\.pj(\[data-th=light\])?$/, /^\.pj /], // projector's own fixed high-contrast palette
  report: [/^\.rp-sheet$/, /^\.rp-sheet-(school|meta|nums)$/, /^\.rp-sheet-nums (> div|span)$/, /^table\.rp-sheet-table( th| td)?$/, /^table\.rp-sheet-table th, table\.rp-sheet-table td$/], // paper preview of the printed report (exact selectors only)
  scan: [/^\.cam-(wrap|frame|tools button)$/], // camera video overlay
};

function rulesOf(css: string): { sel: string; body: string }[] {
  const out: { sel: string; body: string }[] = [];
  // flatten @media: take every `selector { body }` pair, innermost first
  for (const m of strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ sel: m[1].replace(/@media[^{]*\{/g, "").trim(), body: m[2] });
  return out;
}

// hex, any colour function (case-insensitive), and every CSS named colour as a whole word (var(--names) and "transparent"/"currentColor" are fine)
const NAMED = "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(" ");
const FIXED = new RegExp("#[0-9a-f]{3,8}\\b|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\(|(?<![A-Za-z0-9_-])(?:" + NAMED.join("|") + ")(?![A-Za-z0-9_-])", "i");

describe("the detector itself", () => {
  it("catches the colours it must", () => {
    for (const v of ["#FFF", "#a1b2c3d4", "RGB(1,2,3)", "HSLA(1,2%,3%,.5)", "oklch(.5 .1 20)", "hwb(1 2% 3%)", "color(display-p3 1 0 0)", "White", "1px solid Red", "var(--x, #fff)", "0 0 0 100vmax rebeccapurple"]) expect(FIXED.test(v), v).toBe(true);
  });
  it("lets tokens and keywords through", () => {
    for (const v of ["var(--surface-2)", "color-mix(in srgb, var(--ink) 40%, transparent)", "transparent", "currentColor", "var(--tan-1)", "0.5px solid var(--border)"]) expect(FIXED.test(v), v).toBe(false);
  });
  it("only the exact paper selectors are exempt", () => {
    const ok = ALLOWED.report.some((re) => re.test(".rp-sheet"));
    const toolbar = [".rp-sheet-toolbar", ".rp-sheetbar", ".rp-sheet-table"].some((s) => ALLOWED.report.some((re) => re.test(s)));
    expect(ok).toBe(true); expect(toolbar).toBe(false);
    expect(ALLOWED.stickers.some((re) => re.test(".sheet-overlay"))).toBe(false);
  });
});

describe("no fixed colours in the swept stylesheets", () => {
  for (const f of FILES) {
    it(`${f}.css`, () => {
      const bad: string[] = [];
      for (const r of rulesOf(read(f))) {
        const allowed = (ALLOWED[f] ?? []).some((re) => r.sel.split(",").every((s) => re.test(s.trim().replace(/^body\.print-\w+\s+/, ""))));
        if (allowed) continue;
        const decls = r.body.split(";").filter((d) => /:\s*/.test(d));
        for (const d of decls) {
          const val = d.slice(d.indexOf(":") + 1);
          // a fixed colour inside var(--x, fallback) counts too; token names themselves never match
          if (FIXED.test(val)) bad.push(`${r.sel} { ${d.trim()} }`);
        }
      }
      expect(bad).toEqual([]);
    });
  }
  it("the allowed exceptions each carry a reason comment in the css", () => {
    expect(read("print")).toMatch(/hex below on purpose/);
    expect(read("projector")).toMatch(/hex below on purpose/);
    expect(read("stickers")).toMatch(/fixed colours on purpose/);
    expect(read("report")).toMatch(/paper sheet: fixed/);
    expect(read("scan")).toMatch(/camera view: always dark/);
  });
});

// ---- 2. contrast of declared pairs in the 6 colour sets ----
const tokens = readFileSync(path.join(dir, "tokens.css"), "utf8");
type Vars = Record<string, string>;
function tokenRules(): { sel: string; vars: Vars; media: boolean }[] {
  const out: { sel: string; vars: Vars; media: boolean }[] = [];
  for (const m of strip(tokens).matchAll(/(@media[^{]*\{\s*)?([^{}@]+)\{([^{}]*)\}/g)) {
    const vars: Vars = {};
    for (const d of m[3].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim();
    out.push({ sel: m[2].trim(), vars, media: !!m[1] });
  }
  return out;
}
function resolved(skin: string, mode: "light" | "dark"): Vars {
  const all: Vars = {};
  for (const r of tokenRules()) {
    if (r.media) continue;
    const hit = r.sel.split(",").some((s) => {
      s = s.trim();
      if (s === ":root" || s === `:root[data-theme="${mode}"]`) return true;
      const m = /^:root(?::not\(\[data-skin\]\)|\[data-skin="(\w+)"\])(.*)$/.exec(s);
      if (!m) return false;
      if (m[1] ? m[1] !== skin : skin !== "warm") return false;
      if (m[2] === "") return true;
      if (m[2] === ':not([data-theme="dark"])') return mode === "light";
      return m[2] === '[data-theme="dark"]' && mode === "dark";
    });
    if (hit) Object.assign(all, r.vars);
  }
  return all;
}
type RGB = [number, number, number];
function parse(css: string): [number, number, number, number] {
  css = css.trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css);
  if (m) {
    const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  m = /^rgba?\(([^)]+)\)$/.exec(css);
  if (m) { const p = m[1].split(",").map(parseFloat); return [p[0], p[1], p[2], p[3] ?? 1]; }
  throw new Error("colour not understood: " + css);
}
const flat = (css: string, under: RGB): RGB => { const [r, g, b, a] = parse(css); return [r * a + under[0] * (1 - a), g * a + under[1] * (1 - a), b * a + under[2] * (1 - a)]; };
const lum = ([r, g, b]: RGB) => { const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a: RGB, b: RGB) => { const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)]; return (hi + 0.05) / (lo + 0.05); };

interface Pair { file: string; sel: string; fg: string; bg: string[]; min: number; how: string }
const isMark = (sel: string) => /(^|[\s.])(ic|ei|dot|mark|av)(?![\w-])|-ic(?![\w-])|-dot(?![\w-])/.test(sel);
/** rules whose colour pairs with a fill set in a variant rule: checked in the explicit list below */
const SKIP = new Set([".fb .ic"]);
const SURFACES = ["var(--surface-0)", "var(--surface-1)", "var(--surface-2)"];

/** resolve a css colour value (hex, rgba, var(--x), var(--x, fallback), color-mix(in srgb, A p%, B|transparent)) or throw */
function colour(val: string, v: Vars, under: RGB, depth = 0): RGB {
  val = val.trim();
  if (depth > 6) throw new Error("too deep: " + val);
  let m = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*(.+))?\)$/.exec(val);
  if (m) {
    if (m[1] in v) return colour(v[m[1]], v, under, depth + 1);
    if (m[2]) return colour(m[2], v, under, depth + 1);
    throw new Error("undefined token " + m[1]);
  }
  m = /^color-mix\(\s*in srgb\s*,\s*(.+?)\s+(\d+(?:\.\d+)?)%\s*,\s*(.+)\)$/.exec(val);
  if (m) {
    const p = parseFloat(m[2]) / 100;
    const a = colour(m[1], v, under, depth + 1);
    const b = /^transparent$/.test(m[3].trim()) ? under : colour(m[3], v, under, depth + 1);
    return [a[0] * p + b[0] * (1 - p), a[1] * p + b[1] * (1 - p), a[2] * p + b[2] * (1 - p)];
  }
  if (/^(currentcolor|inherit|transparent|none|unset|initial)$/i.test(val)) throw new Error("not a fixed colour: " + val);
  return flat(val, under);
}
const COLOUR_PROP = /^(color|background|background-color)$/;
const splitSel = (sel: string) => sel.split(",").map((x) => x.trim()).filter(Boolean);
const parentSel = (sel: string) => { const p = sel.split(/\s+/); return p.length > 1 && !/^[>+~]$/.test(p[p.length - 2]) ? p.slice(0, -1).join(" ") : p.length > 2 ? p.slice(0, -2).join(" ") : ""; };

/** every rule that sets a text colour: its background is the same rule's, else its parent rule's, else the page/card surfaces */
function pairs(): Pair[] {
  const out: Pair[] = [];
  for (const f of FILES) {
    if (["print", "projector", "stickers"].includes(f)) continue; // fixed palettes, checked by hand
    const rules = rulesOf(read(f));
    const bgOf = new Map<string, string>();
    for (const r of rules) {
      for (const d of r.body.split(";")) {
        const i = d.indexOf(":");
        if (i > 0 && /^(background|background-color)$/.test(d.slice(0, i).trim()) && !/^(none|transparent|inherit|currentcolor)$/i.test(d.slice(i + 1).trim()) && !/gradient|^url/.test(d)) for (const s of splitSel(r.sel)) bgOf.set(s, d.slice(i + 1).trim());
      }
    }
    for (const r of rules) {
      let fg = "", bg = "";
      for (const d of r.body.split(";")) {
        const i = d.indexOf(":");
        if (i < 0) continue;
        const prop = d.slice(0, i).trim(), val = d.slice(i + 1).trim();
        if (!COLOUR_PROP.test(prop) || /^(none|transparent|inherit|currentcolor)$/i.test(val) || /gradient|^url/.test(val)) continue;
        if (prop === "color") fg = val;
        else bg = val;
      }
      if (!fg || /currentcolor|^inherit$|^transparent$/i.test(fg)) continue; // follows another colour: nothing to compare
      if (/^\.pj\b/.test(r.sel)) continue; // projector palette (--pj-*) is defined in projector.css
      for (const sel of splitSel(r.sel)) {
        if (SKIP.has(sel)) continue;
        let how = "same rule", bgs = bg ? [bg] : [];
        if (!bgs.length) { const up = bgOf.get(parentSel(sel)); if (up) { bgs = [up]; how = "parent rule"; } }
        if (!bgs.length && /^\.rp-sheet|^table\.rp-sheet/.test(sel)) { bgs = ["#ffffff"]; how = "paper"; }
        if (!bgs.length) { bgs = SURFACES; how = "surfaces"; }
        out.push({ file: f, sel, fg, bg: bgs, min: isMark(sel) ? 3 : 4.5, how });
      }
    }
  }
  // pairs that are split over two rules of the same element (colour in the base rule, fill in a variant rule)
  const x = (file: string, sel: string, fg: string, bg: string, min: number) => out.push({ file, sel, fg, bg: [bg], min, how: "explicit" });
  x("scan", ".fb.idle .ic", "var(--surface-2)", "var(--text-muted)", 3);
  x("scan", ".fb.success .ic", "var(--on-success)", "var(--fill-success)", 3);
  x("scan", ".fb.danger .ic", "var(--on-danger)", "var(--fill-danger)", 3);
  x("scan", ".fb.warning .ic", "var(--on-warning)", "var(--fill-warning)", 3);
  x("scan", ".fb.accent .ic", "var(--on-accent)", "var(--accent)", 3);
  for (const k of ["success", "warning", "danger", "accent"]) x("scan", `.fb.${k} .name`, `var(--text-${k})`, `var(--bg-${k})`, 4.5);
  return out;
}

describe("contrast of declared colour pairs (AC-37)", () => {
  const list = pairs();
  it("finds the pairs to check, including parent-rule and explicit ones", () => {
    expect(list.length).toBeGreaterThan(40);
    expect(list.some((p) => p.how === "parent rule")).toBe(true);
    expect(list.some((p) => p.sel === ".ob-done")).toBe(true);
  });
  for (const skin of ["pro", "warm", "playful"]) {
    for (const mode of ["light", "dark"] as const) {
      it(`${skin} ${mode}: every text-on-fill pair in the page styles (unresolvable values fail)`, () => {
        const v = resolved(skin, mode);
        const bad: string[] = [];
        const base = flat(v["--surface-2"], [0, 0, 0]);
        for (const p of list) {
          try {
            for (const b of p.bg) {
              const bg = colour(b, v, base), fg = colour(p.fg, v, bg);
              const r = ratio(fg, bg);
              if (r < p.min) bad.push(`${p.file} ${p.sel}: ${p.fg} on ${b} (${p.how}) = ${r.toFixed(2)} < ${p.min}`);
            }
          } catch (e) { bad.push(`${p.file} ${p.sel}: cannot resolve (${(e as Error).message})`); }
        }
        expect(bad).toEqual([]);
      });
    }
  }
});
