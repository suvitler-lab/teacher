import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { backupLine, termLine, daysUntil } from "../../src/components/settings/SettingsCards";
import { useConfirm } from "../../src/components/ConfirmDialog";

// ui-redesign round 3: the settings page's cards state their facts in one fixed wording.
describe("settings cards wording", () => {
  it("daysUntil counts plain calendar days", () => {
    expect(daysUntil("2026-11-27", "2026-11-03")).toBe(24);
    expect(daysUntil("2026-11-03", "2026-11-03")).toBe(0);
    expect(daysUntil("2026-11-01", "2026-11-03")).toBe(-2);
  });

  it("term line: running, ended, no end date, no term", () => {
    expect(termLine({ name: "1/2569", end_date: "2026-11-27" }, "2026-11-03").text).toContain("เหลือ 24 วัน");
    const ended = termLine({ name: "1/2569", end_date: "2026-10-31" }, "2026-11-03");
    expect(ended.ended).toBe(true);
    expect(ended.text).toContain("สิ้นสุดแล้ว 3 วัน");
    expect(termLine({ name: "1/2569", end_date: null }).noEnd).toBe(true);
    expect(termLine(null).none).toBe(true);
  });

  it("backup line: never, fresh, stale after 7 days", () => {
    const now = Date.UTC(2026, 10, 3, 12);
    expect(backupLine(0, now)).toEqual({ text: "ยังไม่เคยสำรอง", stale: true });
    expect(backupLine(now - 2 * 86_400_000, now).stale).toBe(false);
    const old = backupLine(now - 9 * 86_400_000, now);
    expect(old.stale).toBe(true);
    expect(old.text).toBe("สำรองล่าสุด 9 วันก่อน · ควรสำรองสัปดาห์ละครั้ง");
  });
});

describe("useConfirm (replaces window.confirm)", () => {
  function Host({ onAnswer }: { onAnswer: (v: boolean) => void }) {
    const { ask, node } = useConfirm();
    return <div><button onClick={async () => onAnswer(await ask({ title: "ออกจากหน้านี้?", body: "ยังไม่ได้บันทึก", yes: "ออกโดยไม่บันทึก", no: "อยู่ต่อ", danger: true }))}>เปิด</button>{node}</div>;
  }
  let answer: ReturnType<typeof vi.fn<(v: boolean) => void>>;
  beforeEach(() => { answer = vi.fn<(v: boolean) => void>(); });

  it("yes resolves true", async () => {
    render(<Host onAnswer={answer} />);
    fireEvent.click(screen.getByText("เปิด"));
    fireEvent.click(await screen.findByText("ออกโดยไม่บันทึก"));
    await waitFor(() => expect(answer).toHaveBeenCalledWith(true));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("no, close and Esc all resolve false", async () => {
    render(<Host onAnswer={answer} />);
    fireEvent.click(screen.getByText("เปิด"));
    fireEvent.click(await screen.findByText("อยู่ต่อ"));
    await waitFor(() => expect(answer).toHaveBeenLastCalledWith(false));
    fireEvent.click(screen.getByText("เปิด"));
    await screen.findByRole("alertdialog");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(answer).toHaveBeenCalledTimes(2));
    expect(answer).toHaveBeenLastCalledWith(false);
  });
});
