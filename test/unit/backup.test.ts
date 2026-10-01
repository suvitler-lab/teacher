// The app reads a backup in many requests. If another device saves in the middle, the file would be half before and
// half after — so the read is checked against the server's fingerprint before and after, and repeated.
import { describe, it, expect, beforeEach, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());
const put = vi.hoisted(() => vi.fn());
vi.mock("@client/lib/api", async (orig) => {
  const actual = await orig<typeof import("@client/lib/api")>();
  return { ...actual, api: { get, post: vi.fn(), put } };
});

import { webcrypto } from "node:crypto";
import { runBackup, BackupInconsistentError, backupFileName } from "@client/lib/backup";

const TABLES = 13;

/** A server whose fingerprint answers come from `prints` in order, and whose one big table has two pages. */
function server(prints: string[]) {
  const seq = [...prints];
  const reads: string[] = [];
  get.mockImplementation(async (path: string) => {
    if (path === "/api/backup/fingerprint") return { fingerprint: seq.length > 1 ? seq.shift() : seq[0] };
    const m = /table=(\w+)&cursor=(\d+)/.exec(path)!;
    reads.push(`${m[1]}@${m[2]}`);
    if (m[1] === "students") return m[2] === "0"
      ? { rows: [{ id: "s1" }, { id: "s2" }], nextCursor: 2, schema_version: 6 }
      : { rows: [{ id: "s3" }], nextCursor: null, schema_version: 6 };
    return { rows: [], nextCursor: null, schema_version: 6 };
  });
  return { reads };
}

const click = vi.fn();
beforeEach(() => {
  get.mockReset(); put.mockReset(); click.mockReset();
  put.mockResolvedValue({});
  vi.stubGlobal("crypto", webcrypto);
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
});

describe("the backup file's name", () => {
  it("is dated in Bangkok: a backup at 06:00 there is that day, not the day before (which is what UTC would say)", () => {
    expect(backupFileName(Date.parse("2026-09-29T23:00:00Z"))).toBe("ngankrob-backup-2026-09-30.json"); // 06:00 on the 30th in Bangkok
    expect(backupFileName(Date.parse("2026-09-30T16:59:00Z"))).toBe("ngankrob-backup-2026-09-30.json"); // 23:59 on the 30th
    expect(backupFileName(Date.parse("2026-09-30T17:00:00Z"))).toBe("ngankrob-backup-2026-10-01.json"); // just after midnight
  });
});

describe("runBackup", () => {
  it("reads once when nothing changed, joins the pages of a table, and downloads the file", async () => {
    const s = server(["A", "A"]);
    const file = await runBackup();
    expect(s.reads.filter((r) => r.startsWith("students"))).toEqual(["students@0", "students@2"]);
    expect(file.data.students.map((r) => r.id)).toEqual(["s1", "s2", "s3"]);
    expect(file.counts.students).toBe(3);
    expect(file.fingerprint).toBe("A");
    expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("reads again when the data changed while it was being read, and only keeps a clean read", async () => {
    const s = server(["A", "B", /* second attempt */ "C", "C"]);
    const retried: number[] = [];
    const file = await runBackup({ onRetry: (n) => retried.push(n) });
    expect(retried).toEqual([1]);
    expect(s.reads.filter((r) => r === "settings@0")).toHaveLength(2); // the whole read was repeated
    expect(file.fingerprint).toBe("C");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("gives up — with a message a teacher can act on — if it never holds still, and writes NO file", async () => {
    server(["A", "B", "C", "D", "E", "F"]);
    const retried: number[] = [];
    const err = await runBackup({ onRetry: (n) => retried.push(n) }).catch((e) => e);
    expect(err).toBeInstanceOf(BackupInconsistentError);
    expect(err.message).toMatch(/เครื่องอื่นกำลังบันทึก/);
    expect(retried).toEqual([1, 2]); // told about the retries, not about the final failure
    expect(click).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled(); // and it does not claim a backup was made
  });

  it("marks the time of the last backup only after a clean file was handed over", async () => {
    server(["A", "A"]);
    await runBackup();
    await vi.waitFor(() => expect(put).toHaveBeenCalledWith("/api/settings", { last_backup_at: expect.any(String) }));
  });

  it("does not hand over a file if the server cannot be reached for the check", async () => {
    get.mockRejectedValue(new Error("offline"));
    await expect(runBackup()).rejects.toThrow("offline");
    expect(click).not.toHaveBeenCalled();
  });

  it("asks the fingerprint before and after each read (so a change at either end is seen)", async () => {
    server(["A", "A"]);
    await runBackup();
    const calls = get.mock.calls.map((c) => c[0] as string);
    expect(calls[0]).toBe("/api/backup/fingerprint");
    expect(calls.at(-1)).toBe("/api/backup/fingerprint");
    expect(calls.filter((p) => p.startsWith("/api/backup?"))).toHaveLength(TABLES + 1); // 13 tables, one has a second page
  });
});
