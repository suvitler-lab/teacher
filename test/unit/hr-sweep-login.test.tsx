// T-30 (AC-08): the login page paints with the look remembered on this device (skin + light/dark) before any data,
// and shows nothing about rooms or students.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/preact";
const { get, post, put } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@client/lib/api", async orig => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post, put } }));
import { applyStoredTheme } from "@client/lib/theme";
import { applyStoredAppearance } from "@client/lib/appearance";
import { Setup } from "@client/pages/Setup";

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); document.documentElement.removeAttribute("data-skin"); document.documentElement.removeAttribute("data-theme"); });

describe("login uses the remembered look", () => {
  it("remembered skin and dark mode are on <html> before the form renders", () => {
    localStorage.setItem("ngankrob-skin", "playful");
    localStorage.setItem("ngankrob-theme", "dark");
    applyStoredTheme(); applyStoredAppearance(); // what main.tsx does before the first paint
    render(<Setup mode="login" />);
    expect(document.documentElement.getAttribute("data-skin")).toBe("playful");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
  it("nothing remembered: the default look, still no data calls and no room/student text", () => {
    applyStoredTheme(); applyStoredAppearance();
    const { container } = render(<Setup mode="login" />);
    expect(document.documentElement.getAttribute("data-skin") ?? "warm").toBe("warm");
    expect(get).not.toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/ป\.\d|ม\.\d|ห้อง/);
  });
});
