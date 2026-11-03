import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Assignment, Student } from "@shared/types";

// ui-redesign round 2 (scan page): the day a hand-in was received travels with every op, an unknown class number
// says which room it was looked up in, and taking a hand-in back offers a way to change one's mind.
const get = vi.hoisted(() => vi.fn());
const enqueue = vi.hoisted(() => vi.fn(async (_op?: unknown) => {}));
vi.mock("@client/lib/api", async (orig) => {
  const actual = await orig<typeof import("@client/lib/api")>();
  return { ...actual, api: { get, post: vi.fn().mockResolvedValue({}), put: vi.fn() } };
});
vi.mock("@client/lib/outbox", async (orig) => {
  const actual = await orig<typeof import("@client/lib/outbox")>();
  return { ...actual, enqueueSubmission: enqueue };
});
vi.mock("@client/lib/sound", () => ({ beep: { ok() {}, err() {}, dup() {}, undo() {} }, vibrate() {} }));

import { assignments, students, classes } from "@client/store";
import { toasts } from "@client/lib/notify";
import { bkkToday } from "@shared/time";
import { __scan } from "@client/pages/Scan";

const asg: Assignment = {
  id: "A", term_id: null, subject_id: null, type_id: null, title: "A", unit: null, full_score: 10, assigned_date: "2020-01-01", due_date: null,
  note: null, publish_scores: true, status: "open", class_ids: ["c1"], created_at: 0, updated_at: 0, deleted_at: null,
};
const stu: Student = {
  id: "st1", code: "101", qr_token: "Q-AAAAAAAAAA", prefix: null, first_name: "ก", last_name: "ข", nickname: null,
  class_id: "c1", number: 1, status: "active", left_at: null, updated_at: 0,
};

beforeEach(async () => {
  get.mockReset(); enqueue.mockClear(); toasts.value = [];
  get.mockResolvedValue({ submissions: [], serverTime: 100 });
  assignments.value = [asg]; students.value = [stu];
  classes.value = [{ id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false } as never];
  __scan.session.value = null; __scan.feedback.value = null; __scan.recvDate.value = null;
  await __scan.startSession("A", "c1", "full");
});

describe("scan round 2", () => {
  it("a hand-in carries today's date by default", async () => {
    __scan.commitStudent(stu, "manual");
    expect(enqueue.mock.calls[0][0]).toMatchObject({ status: "submitted", receivedDate: bkkToday() });
  });

  it("a picked earlier day is sent as the received date", async () => {
    __scan.recvDate.value = "2026-10-30";
    __scan.commitStudent(stu, "manual");
    expect(enqueue.mock.calls[0][0]).toMatchObject({ receivedDate: "2026-10-30" });
  });

  it("taking a hand-in back sends a void op without a date", async () => {
    __scan.commitStudent(stu, "manual");
    __scan.undo("st1");
    const voidOp = enqueue.mock.calls.map((c) => c[0] as any).find((o) => o.status === "void");
    expect(voidOp).toBeTruthy();
    expect(voidOp.receivedDate).toBeUndefined();
  });

  it("taking it back offers 'เลิกทำ', and using it puts the hand-in back", async () => {
    __scan.commitStudent(stu, "manual");
    __scan.undo("st1");
    const t = toasts.value.find((x) => x.action?.label === "เลิกทำ");
    expect(t).toBeTruthy();
    t!.action!.run();
    const last = enqueue.mock.calls.at(-1)![0] as any;
    expect(last).toMatchObject({ status: "submitted", studentId: "st1" });
    expect(__scan.effSub("st1")?.status).toBe("submitted");
  });

  it("an unknown class number names the room it was looked up in", async () => {
    __scan.handleScan("99", "manual");
    expect(__scan.feedback.value).toMatchObject({ kind: "danger", name: "ไม่มีเลขที่ 99 ใน ป.6/1" });
  });
});
