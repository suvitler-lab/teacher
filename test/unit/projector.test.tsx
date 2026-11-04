import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "preact";
import { act, render, screen, fireEvent } from "@testing-library/preact";

vi.mock("@client/router", async (orig) => ({ ...(await orig<typeof import("@client/router")>()), navigate: vi.fn() }));

import { ProjectorShell, ProjectorButton } from "@client/components/Projector";
import { projectorOn, startProjector, exitProjector, pjTheme, pjSize, setPjTheme, setPjSize, pjHint } from "@client/lib/projector";

beforeEach(() => { exitProjector(); setPjTheme("dark"); setPjSize(2); });

describe("projector mode", () => {
  it("starts and exits, and remembers theme and size", () => {
    expect(projectorOn.value).toBe(false);
    startProjector();
    expect(projectorOn.value).toBe(true);
    setPjTheme("light"); setPjSize(3);
    exitProjector();
    expect(projectorOn.value).toBe(false);
    expect(pjTheme.value).toBe("light");
    expect(pjSize.value).toBe(3);
  });

  it("the shell shows the page title, 'กำลังฉายจอ', and the other two pages in the menu", async () => {
    render(h(ProjectorShell, { page: "scan", children: h("div", null, "เนื้อหา") }));
    expect(screen.getByText("สแกนส่งงาน")).toBeTruthy();
    expect(screen.getByText("กำลังฉายจอ")).toBeTruthy();
    expect(screen.getByText("เนื้อหา")).toBeTruthy();
    await act(() => { fireEvent.click(screen.getByText("ไปหน้าอื่น")); });
    expect(screen.getByText("เช็คชื่อ")).toBeTruthy();
    expect(screen.getByText("สุ่มชื่อ")).toBeTruthy();
    expect(screen.getByText("ออกจากโหมดฉายจอ")).toBeTruthy();
  });

  it("Esc leaves the mode; a short tap on × only shows the reminder", async () => {
    startProjector();
    render(h(ProjectorShell, { page: "random", children: null }));
    const x = screen.getByLabelText(/ออกจากโหมดฉายจอ — กดค้าง/);
    await act(() => { fireEvent.pointerDown(x); fireEvent.pointerUp(x); });
    expect(projectorOn.value).toBe(true);
    expect(pjHint.value).toBe(true);
    await act(() => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(projectorOn.value).toBe(false);
  });

  it("the header button opens the look choices and starts the mode", async () => {
    render(h(ProjectorButton, {}));
    await act(() => { fireEvent.click(screen.getByText("โหมดฉายจอ")); });
    await act(() => { fireEvent.click(screen.getByText("สว่าง")); fireEvent.click(screen.getByText("ใหญ่มาก")); });
    await act(() => { fireEvent.click(screen.getByText("เริ่มฉายจอ")); });
    expect(projectorOn.value).toBe(true);
    expect(pjTheme.value).toBe("light");
    expect(pjSize.value).toBe(3);
  });
});
