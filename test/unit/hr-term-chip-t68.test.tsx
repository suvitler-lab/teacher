// @vitest-environment jsdom
// T-68 / AC-211 P6: the term chip carries a link to the terms list, inside the chip (no extra row).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/preact";
import { TermPicker } from "@client/components/ui";
import { terms, selectedTermId, currentTermId } from "@client/store";

afterEach(cleanup);

describe("TermPicker manage link (AC-211 P6)", () => {
  it("has a named link to catalog / terms tab inside the same chip", () => {
    terms.value = [{ id: "t1", year: 2569, term: 1, name: "1/2569", is_current: true, start_date: "2026-05-16", end_date: "2027-03-31", updated_at: 0 }];
    currentTermId.value = selectedTermId.value = "t1";
    const { container } = render(<TermPicker />);
    const a = screen.getByRole("link", { name: "จัดการภาคเรียน" });
    expect(a.getAttribute("href")).toBe("#/settings?section=catalog&tab=terms");
    expect(container.querySelectorAll("label.pill")).toHaveLength(1);
    expect(a.closest("label.pill")).not.toBeNull(); // same chip, not a new element beside it
    expect(screen.getByRole("combobox", { name: "ภาคเรียนที่แสดง" })).toBeTruthy(); // the picker itself is unchanged
  });

  it("renders nothing when there are no terms (as before)", () => {
    terms.value = [];
    const { container } = render(<TermPicker />);
    expect(container.innerHTML).toBe("");
  });
});
