import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { Assignment, Student } from "@shared/types";

const { get, post, enqueue } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), enqueue: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({
  ...await orig<typeof import("@client/lib/api")>(), api: { get, post },
}));
vi.mock("@client/lib/outbox", async (orig) => ({
  ...await orig<typeof import("@client/lib/outbox")>(), enqueueSubmission: enqueue,
}));
vi.mock("@client/lib/sound", () => ({ beep: { ok() {}, err() {}, dup() {}, undo() {} }, vibrate() {} }));
vi.mock("@client/lib/hid", () => ({ installHidScanner: () => () => {} }));

import { ScanPage, __scan } from "@client/pages/Scan";
import { assignments, classes, students } from "@client/store";
import { pendingOps, failedPairKeys } from "@client/lib/outbox";

const assignment: Assignment = {
  id: "a1", term_id: null, subject_id: null, type_id: null, title: "เรขาคณิต", unit: null,
  full_score: 10, assigned_date: null, due_date: null, note: null, publish_scores: true,
  status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
};
const student: Student = {
  id: "st1", code: "101", qr_token: "Q-AAAAAAAAAA", prefix: null, first_name: "นักเรียน", last_name: "ทดสอบ",
  nickname: null, class_id: "c1", number: 1, status: "active", left_at: null, updated_at: 0,
};

beforeEach(async () => {
  vi.clearAllMocks();
  get.mockResolvedValue({ submissions: [], serverTime: 100 });
  post.mockResolvedValue({});
  enqueue.mockResolvedValue(undefined);
  assignments.value = [assignment];
  students.value = [student];
  classes.value = [];
  pendingOps.value = new Map();
  failedPairKeys.value = new Set();
  await __scan.startSession("a1", "c1", "type");
  __scan.commitStudent(student, "manual");
  enqueue.mockClear(); // receiving the work is separate from entering its score
  render(<ScanPage />);
  await screen.findByLabelText("คะแนน");
});
afterEach(() => { __scan.session.value = null; });

const input = () => screen.getByLabelText("คะแนน") as HTMLInputElement;
const save = () => screen.getByRole("button", { name: "บันทึก" }) as HTMLButtonElement;
const enter = (value: string) => fireEvent.input(input(), { target: { value } });

describe("score entry in a scan round", () => {
  it("warns immediately about 80/10, disables saving, and rejects Enter without changing the submission", () => {
    enter("80");
    expect(screen.getByRole("alert").textContent).toBe("คะแนนต้องไม่เกิน 10 คะแนน");
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(input().getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
    expect(save().disabled).toBe(true);
    fireEvent.keyDown(input(), { key: "Enter" });
    fireEvent.click(save());
    expect(enqueue).not.toHaveBeenCalled();
    expect(__scan.effSub("st1")?.score).toBeNull();
    expect(input().value).toBe("80");
  });

  it("validates keypad digits too and clears the warning after backspace fixes the score", () => {
    fireEvent.click(screen.getByRole("button", { name: "8", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "0", exact: true }));
    expect(input().value).toBe("80");
    expect(screen.getByRole("alert").textContent).toContain("ไม่เกิน 10");
    expect(save().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "ลบตัวเลขท้ายสุด" }));
    expect(input().value).toBe("8");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(input().getAttribute("aria-invalid")).toBe("false");
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ score: 8, fullScoreAtScan: 10 }));
  });

  it.each(["-1", "7.3", "abc", "Infinity"])("prevents saving invalid score %s", (value) => {
    enter(value);
    expect(screen.getByRole("alert").textContent).toContain("ใส่คะแนน 0–10");
    expect(save().disabled).toBe(true);
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it.each(["0", "9.5", "10"])("accepts valid score %s after correcting an over-full score", async (value) => {
    enter("80");
    enter(value);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(save().disabled).toBe(false);
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ score: Number(value), fullScoreAtScan: 10 }));
    await waitFor(() => expect(screen.queryByLabelText("คะแนน")).toBeNull());
  });

  it("can still use a valid quick-score button after typing an invalid draft", () => {
    enter("80");
    fireEvent.click(screen.getByRole("button", { name: "10/10", exact: true }));
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ score: 10, fullScoreAtScan: 10 }));
  });

  it("keeps a blank score unsaved and can build a valid half point with the keypad", () => {
    expect(save().disabled).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: ".5", exact: true }));
    expect(input().value).toBe("0.5");
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ score: 0.5 }));
  });
});
