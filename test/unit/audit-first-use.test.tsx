import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
const { get, post, put } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@client/lib/api", async orig => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post, put } }));
import { StartTermModal } from "@client/components/StartTermModal";
import { ReportsPage } from "@client/pages/Reports";
import { GradebookPage } from "@client/pages/Gradebook";
import { AttendancePage } from "@client/pages/Attendance";
import { RandomPage } from "@client/pages/Random";
import { assignments, classes, currentTermId, selectedTermId, settings, students, subjects, terms } from "@client/store";
import { route } from "@client/router";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  route.value = "/home";
  terms.value = []; classes.value = []; subjects.value = []; students.value = []; assignments.value = [];
  currentTermId.value = selectedTermId.value = null;
  settings.value = null;
  post.mockImplementation(() => new Promise(() => {}));
  get.mockResolvedValue({ rows: [] });
});

describe("first-use paths", () => {
  it("allows starting the first term without an invisible rollover confirmation", async () => {
    render(<StartTermModal onClose={() => {}} />);
    const start = screen.getByRole("button", { name: /เริ่มภาคเรียน \d/ }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/terms/start", expect.objectContaining({ expectedCurrentTermId: null, term: 1 })));
  });

  it("still requires explicit confirmation when opening a new school year", () => {
    terms.value = [{ id: "old", year: 2569, term: 2, name: "2/2569", is_current: true, start_date: "2026-11-01", end_date: "2027-03-01", updated_at: 0 }];
    currentTermId.value = selectedTermId.value = "old";
    render(<StartTermModal onClose={() => {}} />);
    const start = screen.getByRole("button", { name: "เริ่มภาคเรียน 1/2570" }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /ตรวจแล้ว/ }));
    expect(start.disabled).toBe(false);
  });

  it.each([["reports", ReportsPage], ["gradebook", GradebookPage], ["attendance", AttendancePage], ["random", RandomPage]] as const)("%s has a usable empty-class action instead of a permanent spinner", async (_name, Page) => {
    render(<Page />);
    expect(screen.getByText(/ยังไม่มีห้องเรียนในปีนี้/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มห้องเรียน" }));
    expect(window.location.hash).toBe("#/settings?section=catalog");
    expect(get.mock.calls.some(([path]) => /[?&]class=(?:&|$)/.test(path))).toBe(false);
  });
});
