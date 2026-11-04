// M1-05 AC-02: the scan screen's colour legend counts seats the way the seat grid colours them.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/preact";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post } }));
vi.mock("@client/lib/sound", () => ({ beep: { ok() {}, err() {}, dup() {}, undo() {} }, vibrate() {} }));
vi.mock("@client/lib/hid", () => ({ installHidScanner: () => () => {} }));

import { ScanPage, __scan } from "@client/pages/Scan";
import { assignments, classes, students } from "@client/store";
import { pendingOps, failedPairKeys } from "@client/lib/outbox";
import { AC01_KIDS, AC01_SUBS, FUTURE_DUE, PAST_DUE, asg } from "./m1-05-fixture";

async function open(due: string, subs = AC01_SUBS("a1")) {
  get.mockResolvedValue({ submissions: subs, serverTime: 100 });
  post.mockResolvedValue({});
  assignments.value = [asg("a1", due, "ใบงาน")];
  students.value = AC01_KIDS;
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 }];
  pendingOps.value = new Map();
  failedPairKeys.value = new Set();
  await __scan.startSession("a1", "c1", "full");
  render(<ScanPage />);
  await waitFor(() => expect(document.querySelectorAll(".sc-cell.scored").length).toBe(4));
}
const legendRows = () => [...document.querySelector(".sc-legend")!.children] as HTMLElement[];
const legend = () => legendRows().map((r) => r.textContent!.trim());
const ring = () => document.querySelector(".pring .cap span")!.textContent;

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { __scan.session.value = null; });

describe("AC-02 scan legend and ring", () => {
  it("lists on time, late, awaiting, not handed in, excused; adds up to the class; ring 6/8", async () => {
    await open(PAST_DUE);
    expect(legend()).toEqual(["ส่งแล้ว 4", "ส่งช้า 1", "รอตรวจ 1", "ยังไม่ส่ง 2", "ยกเว้น 2"]);
    expect(ring()).toBe("6/8");
    // every seat is in exactly one legend group
    const sum = legend().reduce((n, t) => n + Number(t.split(" ").pop()), 0);
    expect(sum).toBe(document.querySelectorAll(".sc-cell").length);
  });

  it("each swatch uses the same colour tokens as its seat", async () => {
    await open(PAST_DUE);
    const sw = (i: number) => (legendRows()[i].firstElementChild as HTMLElement).getAttribute("style")!.replace(/\s/g, "");
    expect(sw(0)).toContain("var(--bg-success)");
    expect(sw(1)).toContain("var(--bg-warning)");
    expect(sw(2)).toContain("var(--bg-accent)");
    expect(sw(3)).toMatch(/dashed.*var\(--border-danger\)/); // overdue seats are red-dashed
    expect(sw(4)).toContain("var(--surface-1)");            // excused seats keep the plain seat colour
  });

  it("hides empty groups; before the due date the not-handed-in swatch is the grey dashed one", async () => {
    await open(FUTURE_DUE, AC01_SUBS("a1").filter((s) => s.status !== "excused" && s.score !== null && !s.late));
    expect(legend()).toEqual(["ส่งแล้ว 4", "ยังไม่ส่ง 6"]);
    expect((legendRows()[1].firstElementChild as HTMLElement).getAttribute("style")!.replace(/\s/g, "")).toMatch(/dashed.*var\(--text-secondary\)/);
    expect(ring()).toBe("4/10");
  });
});
