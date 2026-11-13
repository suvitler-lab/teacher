// T-54 R-5401/R-5402: StartTermModal — the "ตรวจแล้ว" tick belongs to the year/term it was given for.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
const { get, post, put } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get, post, put } }));
import { StartTermModal } from "@client/components/StartTermModal";
import { assignments, classes, currentTermId, selectedTermId, students, terms } from "@client/store";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  terms.value = [{ id: "old", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: "2026-05-01", end_date: "2026-10-01", updated_at: 0 }] as any;
  classes.value = []; students.value = []; assignments.value = [];
  currentTermId.value = selectedTermId.value = "old";
  post.mockImplementation(() => new Promise(() => {}));
});

const tick = () => screen.getByRole("checkbox", { name: /ตรวจแล้ว/ }) as HTMLInputElement;
const startBtn = () => screen.getByRole("button", { name: /^เริ่มภาคเรียน \d/ }) as HTMLButtonElement;
const yearField = () => screen.getByLabelText(/ปีการศึกษา \(พ.ศ.\)/) as HTMLInputElement;

describe("StartTermModal confirm tick", () => {
  it("says it cannot be undone, starts with the keyboard in the year field, and stays off until the tick", () => {
    render(<StartTermModal onClose={() => {}} />);
    expect(screen.getByText(/ย้อนกลับเองไม่ได้ — ตรวจให้แน่ใจ/)).toBeTruthy();
    expect(document.activeElement).toBe(yearField());
    expect(startBtn().disabled).toBe(true);
    fireEvent.click(startBtn());
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(tick());
    expect(startBtn().disabled).toBe(false);
  });

  it("the same-year start also needs the tick (2/2569)", () => {
    render(<StartTermModal onClose={() => {}} />);
    expect(startBtn().textContent).toContain("2/2569");
    expect(startBtn().disabled).toBe(true);
    fireEvent.click(tick());
    expect(startBtn().disabled).toBe(false);
  });

  it("changing the year clears the tick — a tick given for 2/2569 never starts a new year (R-5401)", () => {
    render(<StartTermModal onClose={() => {}} />);
    fireEvent.click(tick());
    expect(tick().checked).toBe(true);
    fireEvent.input(yearField(), { target: { value: "2570" } });
    expect(tick().checked).toBe(false);
    expect(startBtn().disabled).toBe(true);
    fireEvent.click(startBtn());
    expect(post).not.toHaveBeenCalled();
  });

  it("changing the term clears the tick", () => {
    render(<StartTermModal onClose={() => {}} />);
    fireEvent.click(tick());
    fireEvent.input(screen.getByLabelText("ภาคเรียน"), { target: { value: "1" } });
    expect(tick().checked).toBe(false);
  });

  it("with the tick the request goes out once", async () => {
    render(<StartTermModal onClose={() => {}} />);
    fireEvent.click(tick());
    fireEvent.click(startBtn());
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/terms/start", expect.objectContaining({ expectedCurrentTermId: "old", year: 2569, term: 2 })));
  });
});
