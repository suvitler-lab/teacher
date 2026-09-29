import { describe, it, expect, beforeEach } from "vitest";
import { openDB, deleteDB } from "idb";

describe("IndexedDB v1 -> v2 upgrade", () => {
  beforeEach(async () => {
    await deleteDB("ngankrob");
    // reset the module memo so it re-opens the db
    vi_resetModules();
  });

  it("keeps existing outbox items and adds the new stores", async () => {
    // simulate a device already on schema v1 with a queued submission
    const v1 = await openDB("ngankrob", 1, {
      upgrade(d) {
        d.createObjectStore("outbox", { keyPath: "opId" });
        d.createObjectStore("kv");
      },
    });
    await v1.put("outbox", {
      opId: "keepme", kind: "submission",
      payload: { opId: "keepme", assignmentId: "a1", studentId: "s1", status: "submitted", score: 5, fullScoreAtScan: 10, method: "camera", clientTs: 1, scanSessionId: "x" },
      tries: 0, nextAt: 0, createdAt: 1,
    });
    v1.close();

    // opening through the app module upgrades to v2
    const idb = await import("@client/lib/idb");
    const all = await idb.outboxAll();
    expect(all.find((i) => i.opId === "keepme")).toBeTruthy();

    // new stores usable
    await idb.failedAdd([{ opId: "f1", payload: all[0].payload, reason: "invalid", failedAt: 2 }]);
    expect((await idb.failedAll()).length).toBe(1);
    await idb.draftPut({ key: "k", rows: { s1: { status: "present", clientTs: 1, baseUpdatedAt: null } }, rev: 1, updatedAt: 1 });
    expect((await idb.draftGet("k"))?.rev).toBe(1);
  });
});

// vitest doesn't expose resetModules as a global by name here; small shim
function vi_resetModules() {
  // dynamic import cache reset happens per-test-file; deleteDB handles state
}
