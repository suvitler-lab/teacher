// T-29 (D45): every icon name the app uses has a Phosphor glyph in all three weights, and <Icon> follows the skin.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/preact";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Icon } from "@client/components/Icon";
import { ICON_MAP, phosphorName } from "@client/lib/iconMap";
import { ICON_WEIGHT } from "@client/lib/fonts";
import { applyStoredAppearance, resetAppearanceForTests } from "@client/lib/appearance";

const root = path.resolve(__dirname, "../..");
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = path.join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const css = (w: string) => readFileSync(path.join(root, `node_modules/@phosphor-icons/web/src/${w}/style.css`), "utf8");
const glyphs = Object.fromEntries(["bold", "duotone", "fill"].map((w) => [w, css(w)]));
const hasGlyph = (w: string, name: string) => glyphs[w].includes(`.ph-${w}.ph-${name}:before`);

/** Names given to an icon in the source: `<Icon name=…>`, `icon: …`, `icon=…` (quoted words inside, so ternaries count). */
function usedNames(): Set<string> {
  const names = new Set<string>();
  const frag = /(?:<Icon[^>]*?\bname=|\bicon[=:]\s*)(\{[^}]*\}|"[^"]*"|'[^']*')/g;
  for (const f of walk(path.join(root, "src")).filter((p) => /\.(tsx?)$/.test(p))) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(frag)) {
      const withoutTests = m[1].replace(/[!=]==?\s*["'][^"']*["']/g, "").replace(/["'][^"']*["']\s*[!=]==?/g, "");
      for (const q of withoutTests.matchAll(/["']([a-z][a-z0-9-]*)["']/g)) names.add(q[1]);
    }
  }
  // work-type icons are stored in the database (migrations/0002_defaults.sql)
  const sql = readFileSync(path.join(root, "migrations/0002_defaults.sql"), "utf8");
  for (const m of sql.matchAll(/\('wt_[a-z]+',\s*'[^']*',\s*'([a-z0-9-]+)'/g)) names.add(m[1]);
  return names;
}

afterEach(() => { cleanup(); resetAppearanceForTests(); document.documentElement.removeAttribute("data-skin"); });

describe("iconMap", () => {
  it("finds the icon names the app uses (guards the scan below)", () => {
    const names = usedNames();
    for (const n of ["home", "chevron-down", "eye-off", "cloud-x", "dice-3", "pencil", "flask", "trophy"]) expect(names.has(n), n).toBe(true);
    expect(names.size).toBeGreaterThan(80);
  });
  it("every name used in src/ (and the work-type defaults) has a glyph in bold, duotone and fill", () => {
    const missing: string[] = [];
    for (const n of usedNames()) {
      const p = phosphorName(n);
      for (const w of ["bold", "duotone", "fill"]) if (!hasGlyph(w, p)) missing.push(`${n} -> ${p} (${w})`);
    }
    expect(missing).toEqual([]);
  });
  it("every translation in the table points at a real glyph", () => {
    const bad = Object.entries(ICON_MAP).filter(([, p]) => !["bold", "duotone", "fill"].every((w) => hasGlyph(w, p)));
    expect(bad).toEqual([]);
  });
  it("a name that is the same in both sets passes through", () => {
    expect(phosphorName("camera")).toBe("camera");
    expect(phosphorName("home")).toBe("house");
  });
});

describe("<Icon>", () => {
  it("keeps the app name in data-icon and uses the Phosphor glyph of the skin on screen", () => {
    const { container } = render(<Icon name="home" size={20} />);
    const i = container.querySelector("i")!;
    expect(i.getAttribute("data-icon")).toBe("home");
    expect(i.className).toContain("ph-house");
    expect(i.className).toContain("ph-duotone"); // the default skin is warm
    expect(i.getAttribute("aria-hidden")).toBe("true");
  });
  it("weights: pro = bold, warm = duotone, playful = fill", () => {
    expect(ICON_WEIGHT).toEqual({ pro: "bold", warm: "duotone", playful: "fill" });
    for (const skin of ["pro", "playful"] as const) {
      cleanup();
      localStorage.setItem("ngankrob-skin", skin);
      resetAppearanceForTests();
      applyStoredAppearance();
      const { container } = render(<Icon name="settings" />);
      expect(container.querySelector("i")!.className).toContain(`ph-${ICON_WEIGHT[skin]}`);
      expect(container.querySelector("i")!.className).toContain("ph-gear-six");
    }
    localStorage.clear();
  });
  it("keeps the old props: size, class, title (then it is announced, not hidden)", () => {
    const { container } = render(<Icon name="lock" size={30} class="x" title="ปิดรับ" style="color:red" />);
    const i = container.querySelector("i")!;
    expect(i.className).toContain("x");
    expect(i.getAttribute("title")).toBe("ปิดรับ");
    expect(i.getAttribute("aria-label")).toBe("ปิดรับ");
    expect(i.hasAttribute("aria-hidden")).toBe(false);
    expect(i.getAttribute("style")).toMatch(/font-size:\s*2rem/);
    expect(i.getAttribute("style")).toMatch(/color:\s*red/);
  });
});
