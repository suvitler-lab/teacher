import { describe, expect, it, beforeEach } from "vitest";
import { sameOps, sameKeys, pendingOps, failedPairKeys } from "../../src/lib/outbox";
import { rememberClass, rememberSubject, startClass, startSubject, logout } from "../../src/store";

const op = (opId: string) => ({ opId }) as any;

// P4: the outbox must not publish a new value (= redraw the whole table) when nothing changed
describe("P4 outbox change detection", () => {
  it("same cells with the same ops are equal; any difference is not", () => {
    const a = new Map([["x", op("1")], ["y", op("2")]]);
    expect(sameOps(a, new Map([["y", op("2")], ["x", op("1")]]))).toBe(true);
    expect(sameOps(a, new Map([["x", op("1")]]))).toBe(false);
    expect(sameOps(a, new Map([["x", op("1")], ["y", op("3")]]))).toBe(false);
    expect(sameOps(a, new Map([["x", op("1")], ["z", op("2")]]))).toBe(false);
    expect(sameOps(new Map(), new Map())).toBe(true);
  });
  it("sets", () => {
    expect(sameKeys(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
    expect(sameKeys(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
    expect(sameKeys(new Set(["a", "c"]), new Set(["a", "b"]))).toBe(false);
  });
  it("the signals keep their identity across an unchanged refresh (no redraw)", () => {
    const before = pendingOps.value, f = failedPairKeys.value;
    expect(sameOps(before, new Map(before))).toBe(true);
    expect(sameKeys(f, new Set(f))).toBe(true);
  });
});

// P2: class / subject picked on one page are where the next page starts
describe("P2 remembered class and subject", () => {
  const classes = [{ id: "c1" }, { id: "c2" }, { id: "c3" }];
  const subjects = [{ id: "s1" }, { id: "s2" }];
  beforeEach(() => { rememberClass(""); });
  it("starts at the first class until one is picked; a link wins; a class that is no longer offered is ignored", async () => {
    await logout().catch(() => {}); // clears the memory (the network call may fail in tests)
    expect(startClass(null, classes)).toBe("c1");
    rememberClass("c3");
    expect(startClass(null, classes)).toBe("c3");
    expect(startClass("c2", classes)).toBe("c2");
    expect(startClass(null, [{ id: "c1" }, { id: "c2" }])).toBe("c1");
    expect(startClass(null, [])).toBe("");
  });
  it("subject: '' from a link means all subjects and is respected; otherwise the last pick", () => {
    rememberSubject("s2");
    expect(startSubject(undefined, subjects)).toBe("s2");
    expect(startSubject("", subjects)).toBe("");
    expect(startSubject("s1", subjects)).toBe("s1");
    expect(startSubject(undefined, [{ id: "s1" }])).toBe("s1");
  });
  it("picking 'all subjects' is remembered too (not mistaken for 'never picked')", async () => {
    rememberSubject("s2");
    rememberSubject("");
    expect(startSubject(undefined, subjects)).toBe("");
    await logout().catch(() => {});
    expect(startSubject(undefined, subjects)).toBe("s1");
  });
  it("logging out forgets the picks", async () => {
    rememberClass("c3"); rememberSubject("s2");
    await logout().catch(() => {});
    expect(startClass(null, classes)).toBe("c1");
    expect(startSubject(undefined, subjects)).toBe("s1");
  });
});
