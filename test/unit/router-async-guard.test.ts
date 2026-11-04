import { describe, it, expect } from "vitest";
import { route, setNavGuard } from "../../src/router";

// A nav guard may answer later (a dialog instead of confirm()): the page stays put meanwhile, then follows a "yes".
const hashTo = async (h: string) => { location.hash = h; await new Promise((r) => setTimeout(r, 20)); };

describe("async nav guard", () => {
  it("stays while waiting, goes on after yes, stays after no", async () => {
    await hashTo("/settings");
    expect(route.value).toBe("/settings");
    let answer!: (v: boolean) => void;
    setNavGuard(() => new Promise<boolean>((r) => { answer = r; }));
    await hashTo("/home");
    expect(route.value).toBe("/settings");
    expect(location.hash).toBe("#/settings");
    answer(true);
    await new Promise((r) => setTimeout(r, 30));
    expect(route.value).toBe("/home");

    setNavGuard(null);
    await hashTo("/settings");
    setNavGuard(() => Promise.resolve(false));
    await hashTo("/scan");
    await new Promise((r) => setTimeout(r, 30));
    expect(route.value).toBe("/settings");
    setNavGuard(null);
  });

  it("a plain boolean answer still works", async () => {
    await hashTo("/settings");
    setNavGuard(() => true);
    await hashTo("/home");
    expect(route.value).toBe("/home");
    setNavGuard(null);
  });
});
