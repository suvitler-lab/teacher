import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { Dialog } from "@client/components/Dialog";

describe("modal keyboard focus lifecycle", () => {
  it("focuses the first control, wraps Tab and Shift+Tab, then restores the opening control", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener); opener.focus();
    const view = render(<Dialog label="ทดสอบ" onClose={() => {}}><button>แรก</button><button disabled>ไม่พร้อม</button><button>ท้าย</button></Dialog>);
    const first = screen.getByRole("button", { name: "แรก" });
    const last = screen.getByRole("button", { name: "ท้าย" });
    expect(document.activeElement).toBe(first);
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    first.focus(); fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    opener.focus();
    expect(document.activeElement).toBe(first);
    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("only the top nested dialog handles Escape and uses the latest dismissible state", () => {
    const outerClose = vi.fn(), innerClose = vi.fn();
    const view = render(<Dialog label="หลัก" onClose={outerClose}><button>หลัก</button><Dialog label="ซ้อน" onClose={innerClose} dismissible={false}><button>ซ้อน</button></Dialog></Dialog>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(innerClose).not.toHaveBeenCalled(); expect(outerClose).not.toHaveBeenCalled();
    view.rerender(<Dialog label="หลัก" onClose={outerClose}><button>หลัก</button><Dialog label="ซ้อน" onClose={innerClose}><button>ซ้อน</button></Dialog></Dialog>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(innerClose).toHaveBeenCalledTimes(1); expect(outerClose).not.toHaveBeenCalled();
  });
});
