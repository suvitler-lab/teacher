// M1-05: the same data gives the same percent on Home, Gradebook, Reports and Students (BR-05).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/preact";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post, put: vi.fn() } }));
vi.mock("@client/lib/notify", () => ({ ok: vi.fn(), err: vi.fn(), notify: vi.fn(), withToast: vi.fn() }));
vi.mock("@client/components/StudentDrawer", () => ({ StudentDrawer: () => null }));

import { Home } from "@client/pages/Home";
import { GradebookPage } from "@client/pages/Gradebook";
import { ReportsPage } from "@client/pages/Reports";
import { StudentsPage } from "@client/pages/Students";
import { assignments, classes, currentTermId, selectedTermId, students, subjects, terms } from "@client/store";
import { route } from "@client/router";
import type { DashboardPayload } from "@shared/types";
import type { ReportPayload } from "@client/lib/report";
import { AC01_KIDS, AC01_SUBS, AC03_ASGS, AC03_SUBS, AC04_ATT, PAST_DUE, asg, kid } from "./m1-05-fixture";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: null, end_date: null, updated_at: 0 }];
  currentTermId.value = selectedTermId.value = "t1";
  classes.value = [{ id: "c1", name: "ป.6/1", grade: "ป.6", sort: 1, archived: false, year: 2569, updated_at: 0 }];
  subjects.value = [{ id: "math", name: "คณิตศาสตร์", code: null, color: "blue", sort: 1, archived: false, updated_at: 0 }];
});

function reportPayload(over: Partial<ReportPayload>): ReportPayload {
  return {
    classId: "c1", range: { from: null, to: null, month: null, termId: "t1", att: "daily" },
    students: [], assignments: [], submissions: [], attendanceSessions: [], attendance: [], ...over,
  };
}
const AC01_REPORT = () => reportPayload({ students: AC01_KIDS, assignments: [asg("a1", PAST_DUE, "ใบงาน")], submissions: AC01_SUBS("a1") as any });
const AC03_REPORT = () => reportPayload({ students: [kid(0)], assignments: AC03_ASGS, submissions: AC03_SUBS as any });
const AC04_REPORT = () => reportPayload({
  students: [kid(0)],
  attendanceSessions: AC04_ATT.map((_, i) => ({ id: "d" + i, date: `2026-09-0${i + 1}` })),
  attendance: AC04_ATT.map((status, i) => ({ session_id: "d" + i, student_id: "s0", status })),
});

describe("AC-01 per-assignment rate = 6 / (10 - 2) = 75% everywhere", () => {
  it("Home: the class progress bar of an open assignment (and AC-04 attendance card)", async () => {
    const d: DashboardPayload = {
      date: "2026-10-30", termId: "t1", gradingAssignments: [], awaitingCount: 1, missingCount: 2, followUp: [], serverTime: 0,
      openAssignments: [{ assignment: asg("a1", PAST_DUE, "ใบงาน"), perClass: [{ classId: "c1", total: 10, submitted: 6, scored: 5, awaiting: 1, late: 1, missing: 2, excused: 2 }] }],
      attendanceToday: [{ date: "2026-10-30", classId: "c1", present: 3, late: 1, leave: 1, sick: 0, absent: 1, marked: 6, total: 6 }],
    };
    get.mockResolvedValue(d);
    render(<Home />);
    await screen.findByText("ใบงาน");
    const bar = document.querySelector(".hm-prog .pbar > div") as HTMLElement;
    expect(bar.style.width).toBe("75%");
    // AC-04 on Home: (3 + 1) / 6
    expect(screen.getByText("67%")).toBeTruthy();
  });

  it("Gradebook: the column header progress bar and the toolbar rate", async () => {
    route.value = "/gradebook?class=c1&subject=math";
    students.value = AC01_KIDS;
    assignments.value = [asg("a1", PAST_DUE, "ใบงาน")];
    get.mockResolvedValue({ students: AC01_KIDS, assignments: [asg("a1", PAST_DUE, "ใบงาน")], submissions: AC01_SUBS("a1") });
    render(<GradebookPage />);
    await screen.findByRole("columnheader", { name: /ใบงาน/ });
    await waitFor(() => expect((document.querySelector("th .hbar > div") as HTMLElement).style.width).toBe("75%"));
    // the toolbar rate over the same cells: 6 handed in / (6 + 2 overdue)
    expect(document.body.textContent).toContain("อัตราส่ง 75%");
  });

  it("Reports: the per-assignment bar", async () => {
    get.mockResolvedValue(AC01_REPORT());
    render(<ReportsPage />);
    const label = await screen.findByText("ใบงาน", { selector: ".lbl" });
    expect(label.parentElement!.querySelector(".pct")!.textContent).toBe("75%");
  });
});

describe("AC-03 per-child submit rate = 2 / (2 + 1) = 67%", () => {
  it("Gradebook toolbar", async () => {
    route.value = "/gradebook?class=c1&subject=math";
    students.value = [kid(0)];
    assignments.value = AC03_ASGS;
    get.mockResolvedValue({ students: [kid(0)], assignments: AC03_ASGS, submissions: AC03_SUBS });
    render(<GradebookPage />);
    await screen.findByRole("columnheader", { name: /w4/ });
    await waitFor(() => expect(document.body.textContent).toContain("อัตราส่ง 67%"));
  });

  it("Reports: the child's row reads 2/3", async () => {
    get.mockResolvedValue(AC03_REPORT());
    render(<ReportsPage />);
    const name = await screen.findByText(/เด็ก0/, { selector: "td" });
    expect(name.closest("tr")!.children[2].textContent).toBe("2/3");
  });

  it("Students: the child's bar is 67% wide and reads 2/3", async () => {
    route.value = "/students";
    students.value = [kid(0)];
    get.mockResolvedValue(AC03_REPORT());
    render(<StudentsPage />);
    await waitFor(() => expect((document.querySelector(".stu-mini i") as HTMLElement | null)?.style.width).toBe("67%"));
    expect(document.querySelector(".stu-stat.sc")!.textContent).toContain("2/3");
  });
});

describe("AC-04 attendance = (3 + 1) / 6 = 67%, nothing checked = -", () => {
  it("Reports: the child's row", async () => {
    get.mockResolvedValue(AC04_REPORT());
    render(<ReportsPage />);
    const name = await screen.findByText(/เด็ก0/, { selector: "td" });
    expect(name.closest("tr")!.lastElementChild!.textContent).toBe("67%");
  });

  it("Students: per-child % and the class average", async () => {
    route.value = "/students";
    students.value = [kid(0)];
    get.mockResolvedValue(AC04_REPORT());
    render(<StudentsPage />);
    await waitFor(() => expect(document.querySelector(".stu-stat.att")?.textContent).toBe("67%"));
    expect(document.querySelector(".stu-summary")!.textContent).toContain("มาเรียนเฉลี่ย 67%");
  });

  it("Students: no attendance checked shows a dash and no average", async () => {
    route.value = "/students";
    students.value = [kid(0)];
    get.mockResolvedValue(reportPayload({ students: [kid(0)] }));
    render(<StudentsPage />);
    await waitFor(() => expect(document.querySelector(".stu-stat.att")?.textContent).toBe("—"));
    expect(document.querySelector(".stu-summary")!.textContent).not.toContain("มาเรียนเฉลี่ย");
  });
});
