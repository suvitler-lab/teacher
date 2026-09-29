import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// `vite dev` never serves public/_headers, so a policy that breaks a feature is invisible until deploy.
// The iPad camera reader (zxing) is WebAssembly: without 'wasm-unsafe-eval' Safari refuses to compile it.
const csp = (() => {
  const text = readFileSync(path.resolve(__dirname, "../../public/_headers"), "utf8");
  const line = text.split("\n").find((l) => l.trim().startsWith("Content-Security-Policy:"));
  return Object.fromEntries(
    (line ?? "").replace(/^\s*Content-Security-Policy:\s*/, "").split(";").map((d) => d.trim()).filter(Boolean)
      .map((d) => { const [name, ...vals] = d.split(/\s+/); return [name, vals]; }),
  ) as Record<string, string[]>;
})();

describe("Content-Security-Policy", () => {
  it("lets the camera reader compile WebAssembly, without opening up eval() in general", () => {
    expect(csp["script-src"]).toContain("'wasm-unsafe-eval'");
    expect(csp["script-src"]).not.toContain("'unsafe-eval'");
    expect(csp["script-src"]).not.toContain("'unsafe-inline'");
  });

  it("still only loads scripts and connects to its own origin", () => {
    expect(csp["script-src"]).toContain("'self'");
    expect(csp["connect-src"]).toEqual(["'self'"]);
    expect(csp["default-src"]).toEqual(["'self'"]);
  });

  it("lets the camera's workers and frames stay locked down", () => {
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["worker-src"]).toEqual(expect.arrayContaining(["'self'"]));
  });
});
