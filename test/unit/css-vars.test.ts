// A `var(--name)` whose --name is defined nowhere makes the property invalid: a chart bar, dot or avatar painted with it
// is silently invisible (that is how the "85% and over" bars and the "leave" dots vanished). This reads every stylesheet
// and component and fails on any such use, so it cannot slip in again.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../../src");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(css|tsx?)$/.test(n) ? [p] : [];
  });
}

describe("css custom properties", () => {
  const all = files(SRC).map((f) => ({ f: path.relative(SRC, f), text: readFileSync(f, "utf8") }));
  const defined = new Set<string>();
  for (const { text } of all) for (const m of text.matchAll(/(?:^|[\s;{"'`])(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(m[1]);

  it("every var(--x) without a fallback is defined somewhere", () => {
    const missing: string[] = [];
    for (const { f, text } of all) {
      text.split("\n").forEach((line, i) => {
        for (const m of line.matchAll(/var\((--[a-zA-Z0-9-]+)\s*(,[^)]*)?\)/g)) {
          if (!m[2] && !defined.has(m[1])) missing.push(`${f}:${i + 1} ${m[1]}`);
        }
      });
    }
    expect(missing).toEqual([]);
  });

  it("the accent fill exists in the light theme and in both dark ones", () => {
    const tokens = readFileSync(path.join(SRC, "styles/tokens.css"), "utf8");
    expect(tokens.match(/--fill-accent:/g)?.length).toBe(3);
  });
});
