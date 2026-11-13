// T-16: S5 time sheet (FrameSheet / FrameEditor) + S9-b confirm — AC-11…AC-16, AC-35. The API is mocked to the contract (EP-12).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";

const { get, put, post } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post, put } }));

import { ApiError } from "@client/lib/api";
import { classes, currentTermId, settings, subjects, terms } from "@client/store";
import { dataEpoch } from "@client/lib/session";
import { online } from "@client/lib/outbox";
import { ttSeedBootstrap } from "@client/lib/timetable/state";
import { resetTimetableStoreForTests } from "@client/lib/timetable/store";
import { CLASSES, F_T1, FRAME, SUBJECTS, TERM_1_2569, TERM_2_2569 } from "@client/lib/timetable/testdata";
import { FrameEditor, FrameSheet } from "@client/components/timetable/frame";
import { newBreak, withPeriodCount } from "@client/components/timetable/frame/frameDraft";
import { removeSentence } from "@client/components/timetable/frame/RemoveConfirm";
import { serializeFrame, type Frame } from "@shared/timetable";
import type { Settings } from "@shared/types";

const T2 = TERM_2_2569.id;
const baseSettings = (over: Partial<Settings> = {}): Settings => ({
  school_name: "", teacher_name: "", app_title: "งานครบ", late_after: "08:30", theme: "light", accent: "", sound_enabled: false,
  accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true, last_backup_at: "", period_times: "", period_frame: "",
  home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "", ...over,
});
const err = (status: number, code: string, message: string, data: Record<string, unknown> = {}) => new ApiError(status, code, message, { error: code, message, ...data });
const savedFrame = (body: { frame: { periods: Frame["periods"]; breaks: Frame["breaks"]; days: Frame["days"] } }, rev = 1): Frame => ({ v: 1, rev, saved: true, ...body.frame });

beforeEach(() => {
  get.mockReset(); put.mockReset(); post.mockReset();
  resetTimetableStoreForTests();
  online.value = true;
  dataEpoch.value = 5;
  terms.value = [TERM_2_2569]; currentTermId.value = T2; classes.value = CLASSES; subjects.value = SUBJECTS;
  settings.value = baseSettings();
  ttSeedBootstrap({ termId: T2, rev: 7, readOnly: false, slots: F_T1 }, { live: true, at: Date.now(), epoch: 5 });
});
afterEach(() => { cleanup(); online.value = true; });

const time = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const setTime = (label: string, v: string) => fireEvent.input(time(label), { target: { value: v } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
const day = (name: string) => screen.getByRole("button", { name });
const okPut = () => put.mockImplementation(async (_u: string, body: { frame: Parameters<typeof savedFrame>[0]["frame"] }) => ({ ok: true, frame: savedFrame({ frame: body.frame }), removed: 0, timetable: null }));

describe("start values (AC-11, AC-12)", () => {
  it("never set, period_times empty → 7 periods 08:30–16:30, พักกลางวัน 11:30–12:30, จ–ศ", () => {
    render(<FrameEditor />);
    expect(screen.getByRole("spinbutton", { name: "จำนวนคาบต่อวัน" }).getAttribute("aria-valuenow")).toBe("7");
    expect(time("เวลาเริ่มคาบ 1").value).toBe("08:30");
    expect(time("เวลาจบคาบ 3").value).toBe("11:30");
    expect(time("เวลาเริ่มคาบ 4").value).toBe("12:30");
    expect(time("เวลาจบคาบ 7").value).toBe("16:30");
    expect((screen.getByLabelText("ชื่อช่วงพักที่ 1") as HTMLInputElement).value).toBe("พักกลางวัน");
    expect(time("เวลาเริ่มช่วงพักที่ 1").value).toBe("11:30");
    expect(time("เวลาจบช่วงพักที่ 1").value).toBe("12:30");
    expect(["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์"].every((d) => day(`วัน${d}`).getAttribute("aria-pressed") === "true")).toBe(true);
    expect(day("วันเสาร์").getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText("นำเวลาเดิมมาใส่แล้ว ตรวจแล้วกดบันทึก")).toBeNull();
  });

  it("period_times {1:08:00, 2:09:00} → คาบ 1 08:00–09:00, คาบ 2 09:00–10:00, rest default · note · nothing sent until save", () => {
    settings.value = baseSettings({ period_times: JSON.stringify({ "1": "08:00", "2": "09:00" }) });
    render(<FrameEditor />);
    expect([time("เวลาเริ่มคาบ 1").value, time("เวลาจบคาบ 1").value, time("เวลาเริ่มคาบ 2").value, time("เวลาจบคาบ 2").value]).toEqual(["08:00", "09:00", "09:00", "10:00"]);
    expect(time("เวลาเริ่มคาบ 3").value).toBe("10:30");
    expect(screen.getByText("นำเวลาเดิมมาใส่แล้ว ตรวจแล้วกดบันทึก")).toBeTruthy();
    expect(put).not.toHaveBeenCalled();
  });

  it("a saved frame is shown as saved (no 'old times' note)", () => {
    settings.value = baseSettings({ period_frame: serializeFrame(FRAME, 3), period_times: JSON.stringify({ "1": "08:30" }) });
    render(<FrameEditor />);
    expect(screen.queryByText("นำเวลาเดิมมาใส่แล้ว ตรวจแล้วกดบันทึก")).toBeNull();
  });
});

describe("edit + save (AC-13, AC-16)", () => {
  it("8 periods (คาบ 8 → 16:30–17:20), พักเช้า 10:30–10:45, คาบ 3 → 10:45–11:30 → one PUT with the new frame, then onSaved", async () => {
    okPut();
    const onSaved = vi.fn();
    render(<FrameEditor onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มจำนวนคาบ" }));
    expect(time("เวลาเริ่มคาบ 8").value).toBe("16:30");
    setTime("เวลาจบคาบ 8", "17:20");
    fireEvent.click(screen.getByRole("button", { name: /เพิ่มช่วงพัก/ }));
    fireEvent.input(screen.getByLabelText("ชื่อช่วงพักที่ 2"), { target: { value: "พักเช้า" } });
    setTime("เวลาเริ่มช่วงพักที่ 2", "10:30");
    setTime("เวลาจบช่วงพักที่ 2", "10:45");
    setTime("เวลาเริ่มคาบ 3", "10:45");
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledTimes(1);
    const [url, body] = put.mock.calls[0];
    expect(url).toBe("/api/timetable/frame");
    expect(body.baseRev).toBe(0);
    expect(body.frame.periods).toHaveLength(8);
    expect(body.frame.periods[7]).toEqual({ start: "16:30", end: "17:20" });
    expect(body.frame.periods[2].start).toBe("10:45");
    expect(body.frame.breaks).toContainEqual({ name: "พักเช้า", start: "10:30", end: "10:45" });
  });

  it("the second break lands in a free gap, not on top of the lunch break", () => {
    const f = { periods: FRAME.periods, breaks: FRAME.breaks, days: FRAME.days };
    const b = newBreak(f);
    expect(b.start >= "11:30" && b.start < "12:30" && b.end <= "12:30").toBe(false);
    expect(withPeriodCount(f, 8).periods).toHaveLength(8);
    expect(withPeriodCount(f, 9).periods).toHaveLength(8);
  });

  it("เสาร์ on → sent as day 6; off while empty → no question (AC-16)", async () => {
    okPut();
    render(<FrameEditor onSaved={vi.fn()} />);
    fireEvent.click(day("วันเสาร์"));
    expect(day("วันเสาร์").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(day("วันเสาร์"));
    expect(day("วันเสาร์").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(day("วันอาทิตย์"));
    save();
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0][1].frame.days).toEqual([1, 2, 3, 4, 5, 7]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("two edits in the same frame both land (fast taps on days / times)", async () => {
    okPut();
    render(<FrameEditor onSaved={vi.fn()} />);
    const a = day("วันเสาร์"), b = day("วันอาทิตย์");
    fireEvent.click(a); fireEvent.click(b);
    expect(a.getAttribute("aria-pressed")).toBe("true");
    expect(day("วันอาทิตย์").getAttribute("aria-pressed")).toBe("true");
    const s = time("เวลาเริ่มคาบ 1"), e = time("เวลาจบคาบ 1");
    fireEvent.input(s, { target: { value: "08:00" } }); fireEvent.input(e, { target: { value: "08:45" } });
    expect([time("เวลาเริ่มคาบ 1").value, time("เวลาจบคาบ 1").value]).toEqual(["08:00", "08:45"]);
  });

  it("count: − / + , arrow keys, the + button closes at 8 with the 1–8 hint", () => {
    render(<FrameEditor />);
    const spin = screen.getByRole("spinbutton", { name: "จำนวนคาบต่อวัน" });
    fireEvent.keyDown(spin, { key: "ArrowUp" });
    expect(spin.getAttribute("aria-valuenow")).toBe("8");
    expect((screen.getByRole("button", { name: "เพิ่มจำนวนคาบ" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("ตั้งได้ 1–8 คาบ")).toBeTruthy();
    fireEvent.keyDown(spin, { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("button", { name: "ลดจำนวนคาบ" }));
    expect(spin.getAttribute("aria-valuenow")).toBe("6");
    for (let i = 0; i < 9; i++) fireEvent.keyDown(spin, { key: "ArrowDown" });
    expect(spin.getAttribute("aria-valuenow")).toBe("1");
    expect((screen.getByRole("button", { name: "ลดจำนวนคาบ" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("break limit: at 3 breaks the add button is replaced by a note; delete puts focus on the add button", () => {
    render(<FrameEditor />);
    fireEvent.click(screen.getByRole("button", { name: /เพิ่มช่วงพัก/ }));
    fireEvent.click(screen.getByRole("button", { name: /เพิ่มช่วงพัก/ }));
    expect(screen.queryByRole("button", { name: /เพิ่มช่วงพัก/ })).toBeNull();
    expect(screen.getByText("ตั้งช่วงพักได้ไม่เกิน 3 ช่วง")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /^ลบ/ })[1]);
    expect(screen.getByRole("button", { name: /เพิ่มช่วงพัก/ })).toBeTruthy();
  });
});

describe("errors per row (AC-14)", () => {
  it("(ก)(ข)(ค)(จ): messages exact, summary role=alert, focus on the first wrong field, nothing sent", async () => {
    render(<FrameEditor />);
    setTime("เวลาเริ่มคาบ 2", "09:30"); setTime("เวลาจบคาบ 2", "09:30");           // (ก) end not after start
    setTime("เวลาเริ่มคาบ 5", "12:00"); setTime("เวลาจบคาบ 5", "13:30");           // overlaps the lunch break
    setTime("เวลาเริ่มช่วงพักที่ 1", "11:00"); setTime("เวลาจบช่วงพักที่ 1", "12:00"); // (ค) break over period 3
    fireEvent.click(day("วันจันทร์")); fireEvent.click(day("วันอังคาร")); fireEvent.click(day("วันพุธ")); fireEvent.click(day("วันพฤหัส")); fireEvent.click(day("วันศุกร์")); // (จ)
    save();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/แก้ \d+ จุดก่อนบันทึก/);
    expect(screen.getByText("เวลาจบต้องหลังเวลาเริ่ม")).toBeTruthy();
    expect(screen.getByText("พักกลางวันทับคาบ 3 (10:30–11:30)")).toBeTruthy();
    expect(screen.getByText("เลือกวันเรียนอย่างน้อย 1 วัน")).toBeTruthy();
    expect(time("เวลาจบคาบ 2").getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(time("เวลาจบคาบ 2")));
    expect(put).not.toHaveBeenCalled();
  });

  it("(ข) คาบ 2 เริ่ม 09:00 ก่อนคาบ 1 จบ (09:30) → 'คาบ 2 ต้องเริ่มหลังคาบ 1 จบ (09:30)'", async () => {
    render(<FrameEditor />);
    setTime("เวลาเริ่มคาบ 2", "09:00");
    save();
    expect(await screen.findByText("คาบ 2 ต้องเริ่มหลังคาบ 1 จบ (09:30)")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(time("เวลาเริ่มคาบ 2")));
  });

  it("only-days error focuses the first day button; the error goes away when a day is chosen", async () => {
    render(<FrameEditor />);
    for (const d of ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์"]) fireEvent.click(day(`วัน${d}`));
    save();
    await screen.findByText("เลือกวันเรียนอย่างน้อย 1 วัน");
    await waitFor(() => expect(document.activeElement).toBe(day("วันจันทร์")));
    fireEvent.click(day("วันจันทร์"));
    expect(screen.queryByText("เลือกวันเรียนอย่างน้อย 1 วัน")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("422 from the server shows the server's issue on its row", async () => {
    put.mockRejectedValue(err(422, "bad_frame", "เวลาจบต้องหลังเวลาเริ่ม", { issues: [{ code: "end_not_after_start", field: "periods.0.end", period: 1, message: "เวลาจบต้องหลังเวลาเริ่ม" }] }));
    render(<FrameEditor />);
    save();
    expect(await screen.findByText("เวลาจบต้องหลังเวลาเริ่ม")).toBeTruthy();
    expect(time("เวลาจบคาบ 1").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("slots outside the frame (AC-15, BR-08)", () => {
  const removes = [
    { termId: T2, weekday: 1, period: 7, kind: "activity", classId: null, subjectId: null, label: "PLC กลุ่มสาระ" },
    { termId: T2, weekday: 5, period: 7, kind: "activity", classId: null, subjectId: null, label: "PLC สายชั้น" },
  ];
  const conflict = () => err(409, "frame_removes_slots", "ต้องยืนยัน", { count: 2, removes });

  it("asks first with the list; ยกเลิก = nothing more sent and the sheet stays; ลบและบันทึก = second PUT with confirmRemove", async () => {
    put.mockRejectedValueOnce(conflict());
    const onSaved = vi.fn();
    render(<FrameEditor onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "ลดจำนวนคาบ" }));
    save();
    const dlg = await screen.findByRole("alertdialog");
    expect(within(dlg).getByText("จะลบ 2 คาบในคาบ 7: PLC กลุ่มสาระ (จันทร์), PLC สายชั้น (ศุกร์)")).toBeTruthy();
    expect(within(dlg).getByText("ลบจากทุกภาคของปีนี้")).toBeTruthy();
    expect(document.activeElement).toBe(within(dlg).getByRole("button", { name: "ยกเลิก" })); // the safe answer first
    fireEvent.click(within(dlg).getByRole("button", { name: "ยกเลิก" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(put).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();

    put.mockReset();
    put.mockRejectedValueOnce(conflict());
    put.mockResolvedValueOnce({ ok: true, frame: { ...FRAME, rev: 4 }, removed: 2, timetable: null });
    save();
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "ลบและบันทึก" }) as HTMLElement);
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put.mock.calls[1][1].confirmRemove).toBe(2);
  });

  it("one day, several periods → 'จะลบ N คาบของวันศุกร์'", () => {
    const r = [1, 2, 3].map((p) => ({ termId: T2, weekday: 5 as const, period: p, kind: "activity" as const, classId: null, subjectId: null, label: `กิจกรรม ${p}` }));
    expect(removeSentence(r)).toBe("จะลบ 3 คาบของวันศุกร์: กิจกรรม 1 (คาบ 1), กิจกรรม 2 (คาบ 2), กิจกรรม 3 (คาบ 3)");
  });

  it("a successful save after confirm closes the sheet", async () => {
    put.mockRejectedValueOnce(conflict());
    const onClose = vi.fn();
    render(<FrameSheet open onClose={onClose} />);
    save();
    const dlg = await screen.findByRole("alertdialog");
    put.mockResolvedValueOnce({ ok: true, frame: { ...FRAME, rev: 4 }, removed: 2, timetable: null });
    fireEvent.click(within(dlg).getByRole("button", { name: "ลบและบันทึก" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe("saving, failure, offline", () => {
  it("fast double tap sends once; the button reads 'กำลังบันทึก…' and is disabled", async () => {
    let finish: (v: unknown) => void = () => {};
    put.mockImplementation((_u: string, body: { frame: Parameters<typeof savedFrame>[0]["frame"] }) => new Promise((res) => { finish = () => res({ ok: true, frame: savedFrame({ frame: body.frame }), removed: 0, timetable: null }); }));
    const onSaved = vi.fn();
    render(<FrameEditor onSaved={onSaved} />);
    const form = document.querySelector("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    const btn = (await screen.findByRole("button", { name: "กำลังบันทึก…" })) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(put).toHaveBeenCalledTimes(1);
    finish(null);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it("a failed save keeps the form and what was typed, says so, and offers ลองอีกครั้ง", async () => {
    put.mockRejectedValueOnce(err(500, "server_error", "x"));
    render(<FrameEditor onSaved={vi.fn()} />);
    setTime("เวลาเริ่มคาบ 1", "08:00");
    save();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("บันทึกตารางสอนไม่สำเร็จ");
    expect(time("เวลาเริ่มคาบ 1").value).toBe("08:00");
    okPut();
    fireEvent.click(within(alert).getByRole("button", { name: "ลองอีกครั้ง" }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
  });

  it("offline: save is disabled with the sentence, nothing is sent", () => {
    online.value = false;
    render(<FrameEditor />);
    expect((screen.getByRole("button", { name: "บันทึก" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("ออฟไลน์ — ตั้งเวลาคาบได้เมื่อออนไลน์")).toBeTruthy();
    fireEvent.submit(document.querySelector("form")!);
    expect(put).not.toHaveBeenCalled();
  });
});

describe("FrameSheet (AC-35 keyboard)", () => {
  it("closed renders nothing; open is a labelled dialog with focus inside; Esc closes and the opener gets focus back", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    const onClose = vi.fn();
    const { rerender } = render(<FrameSheet open={false} onClose={onClose} returnFocus={opener} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<FrameSheet open onClose={onClose} returnFocus={opener} />);
    const dlg = screen.getByRole("dialog", { name: "ตั้งเวลาคาบ" });
    expect(dlg.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<FrameSheet open={false} onClose={onClose} returnFocus={opener} />);
    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
  });

  it("every control is reachable by keyboard: native buttons / inputs, spinbutton has tabindex 0, day buttons expose aria-pressed + full day name", () => {
    render(<FrameSheet open onClose={vi.fn()} />);
    expect(screen.getByRole("spinbutton").getAttribute("tabindex")).toBe("0");
    expect(screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"))).toHaveLength(7);
    expect(screen.getByRole("button", { name: "ปิด" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ยกเลิก" })).toBeTruthy();
  });
});

describe("V-60 / V-61: sheet controls are a full tap target (CSS-independent of jsdom layout)", () => {
  const css = (f: string) => readFileSync(resolve(__dirname, "../../src/styles", f), "utf8");
  it("close (X) and delete-break use --tap for width and height in both sheets", () => {
    expect(css("timetable-frame.css")).toMatch(/\.tf-head button\.icon[^{]*\.tf-brow button\.icon[^{]*\{[^}]*width: var\(--tap\);[^}]*height: var\(--tap\)/);
    expect(css("timetable.css")).toMatch(/\.tts-head button\.icon \{[^}]*width: var\(--tap\);[^}]*height: var\(--tap\)/);
  });
  it("time fields keep HH:MM and leave room for AM/PM + picker icon (tight padding rule present)", () => {
    expect(css("timetable-frame.css")).toMatch(/input\[type="time"\] \{ padding: 6px 4px 6px 8px/);
    render(<FrameEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    const t = screen.getByLabelText("เวลาเริ่มคาบ 1") as HTMLInputElement;
    expect(t.type).toBe("time");
    expect(t.value).toMatch(/^\d{2}:\d{2}$/);
  });
  it("the sheet close and the break delete buttons exist with accessible names", () => {
    render(<FrameSheet open onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "ปิด" })).toBeTruthy();
  });
});

describe("VF-F4: one day, several periods, two terms (R-04)", () => {
  it("names each term once", () => {
    terms.value = [TERM_1_2569, TERM_2_2569];
    const mk = (termId: string, p: number) => ({ termId, weekday: 5 as const, period: p, kind: "activity" as const, classId: null, subjectId: null, label: `กิจกรรม ${p}` });
    const r = [mk("t2569-2", 1), mk("t2569-2", 2), mk("t2569-1", 1), mk("t2569-1", 2)];
    expect(removeSentence(r)).toBe("จะลบ 4 คาบของวันศุกร์ — ภาค 2/2569: กิจกรรม 1 (คาบ 1), กิจกรรม 2 (คาบ 2) · ภาค 1/2569: กิจกรรม 1 (คาบ 1), กิจกรรม 2 (คาบ 2)");
  });
});
