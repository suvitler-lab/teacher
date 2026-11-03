import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { BackupWarning } from "@client/components/RestoreModal";

// Security review S-04: the backup file holds children's personal data, PINs and QR tokens unencrypted —
// the teacher is told so before it is downloaded.
describe("S-04 warning before a backup is downloaded", () => {
  it("names what is in the file and how to keep it", () => {
    render(<BackupWarning onConfirm={() => {}} onClose={() => {}} />);
    const dlg = screen.getByRole("dialog");
    expect(dlg.textContent).toMatch(/ชื่อ/);
    expect(dlg.textContent).toMatch(/PIN/);
    expect(dlg.textContent).toMatch(/QR/);
    expect(dlg.textContent).toMatch(/ไม่ได้เข้ารหัส/);
    expect(dlg.textContent).toMatch(/LINE|อีเมล/);
  });

  it("downloads only after the teacher confirms; cancel downloads nothing", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<BackupWarning onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /เข้าใจแล้ว ดาวน์โหลด/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
