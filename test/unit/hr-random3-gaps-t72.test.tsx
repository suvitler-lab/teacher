// T-72: races on the random page (verify-qa-b.md section 3 (e): the epoch was never tried).
// Findings are in dev-notes/T-72.md. Short version: `epoch` is paired with clearTimers() at every bump, so it can only be reached by a
// timer that clearTimers() already cancelled -> no test can tell it from clearTimers alone; the two layers are redundant, and the pair is covered below.
// What IS reachable and was uncovered: the two promise races (the late attendance answer of room A, the late history read of room A).
// Fictitious names only; `api` is a mock.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { h } from "preact";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { Student } from "@shared/types";

const get = vi.hoisted(() => vi.fn());
const idb = vi.hoisted(() => ({ hook: null as null | ((k: string) => Promise<unknown> | undefined) }));
vi.mock("@client/lib/api", async (orig) => ({ ...(await orig<typeof import("@client/lib/api")>()), api: { get, post: vi.fn(), put: vi.fn() } }));
vi.mock("@client/router", async (orig) => ({ ...(await orig<typeof import("@client/router")>()), navigate: vi.fn() }));
vi.mock("@client/lib/sound", async (orig) => ({ ...(await orig<typeof import("@client/lib/sound")>()), ting: vi.fn(), primeAudio: vi.fn() }));
vi.mock("@client/lib/idb", async (orig) => {
  const m = await orig<typeof import("@client/lib/idb")>();
  return { ...m, kvGet: (k: string) => idb.hook?.(k) ?? m.kvGet(k) };
});

import { classes, students, settings } from "@client/store";
import { kvSet, kvGet } from "@client/lib/idb";
import { toasts } from "@client/lib/notify";
import { bkkToday } from "@shared/time";
import { RandomPage } from "@client/pages/Random";
import { defaultPageLayout } from "@client/lib/pageCards";
import { serializeLayout, toggleLayoutCard } from "@client/lib/cardLayout";

const kid = (n: number, cls = "c1"): Student => ({
  id: cls + "s" + n, code: "10" + n, qr_token: "Q" + cls + n, prefix: null, first_name: "เด็ก" + n, last_name: "ทดสอบ", nickname: null,
  class_id: cls, number: n, status: "active", left_at: null, updated_at: 0,
});
const body = () => document.body.textContent ?? "";
const key = (c = "c1") => `random:${c}:${bkkToday()}`;
const go = async () => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: /สุ่ม(เลย|คนต่อไป)/ })); }); };
const toRoom = async (name: RegExp) => { await act(async () => { fireEvent.click(screen.getByRole("tab", { name })); }); };
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
function deferred<T>() { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
let restore = () => {};
function reduced() {
  const prev = window.matchMedia;
  window.matchMedia = ((q: string) => ({ matches: /prefers-reduced-motion/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  return () => { window.matchMedia = prev; };
}
// room c1: s1 s2 s3 came; room c2: s1 s2 came (a different count, so a mix-up shows)
const roomRows = (c: string) => (c === "c1" ? [1, 2, 3] : [1, 2]).map((n) => ({ student_id: c + "s" + n, status: "present" }));

beforeEach(async () => {
  get.mockReset(); toasts.value = []; localStorage.clear(); idb.hook = null;
  classes.value = [{ id: "c1", name: "ป.6/1", year: 2569, grade: null, archived: false }, { id: "c2", name: "ป.6/2", year: 2569, grade: null, archived: false }] as never;
  students.value = [...[1, 2, 3].map((n) => kid(n)), ...[1, 2].map((n) => kid(n, "c2"))];
  settings.value = { theme: "light", sound_enabled: false, home_cards: "", random_cards: "" } as never;
  await kvSet(key(), []); await kvSet(key("c2"), []);
  restore = reduced();
});
afterEach(() => { restore(); idb.hook = null; });

describe("the late attendance answer of the room we left (useLoadGuard)", () => {
  it("room c1 answers after the teacher moved to c2: the page keeps c2's numbers", async () => {
    const a = deferred<{ rows: unknown[] }>();
    get.mockImplementation((url: string) => (String(url).includes("class=c1") ? a.promise : Promise.resolve({ rows: roomRows("c2") })));
    render(h(RandomPage, {}));
    await toRoom(/ป\.6\/2/);
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (2)"));
    await act(async () => { a.resolve({ rows: roomRows("c1") }); });
    await flush();
    expect(body()).toContain("เฉพาะคนที่มา (2)");
    expect(body()).not.toContain("เฉพาะคนที่มา (3)");
    // and a draw only ever names a child of c2
    await go();
    await waitFor(() => expect(body()).toContain("สุ่มแล้ว (1)"));
    expect((await kvGet<string[]>(key("c2")))!.every((id) => id.startsWith("c2"))).toBe(true);
  });

  it("room c1 FAILS after the teacher moved to c2: no error is shown over c2's good answer", async () => {
    const a = deferred<{ rows: unknown[] }>();
    get.mockImplementation((url: string) => (String(url).includes("class=c1") ? a.promise : Promise.resolve({ rows: roomRows("c2") })));
    render(h(RandomPage, {}));
    await toRoom(/ป\.6\/2/);
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (2)"));
    await act(async () => { a.reject(new Error("net")); });
    await flush();
    expect(body()).toContain("เฉพาะคนที่มา (2)");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(body()).not.toMatch(/ดึงข้อมูล|ไม่สำเร็จ|ลองอีกครั้ง/);
  });
});

describe("the late history read of the room we left (histEpoch)", () => {
  it("room c1's saved history arrives after the move to c2: c2 keeps its own history and its own count", async () => {
    await kvSet(key("c1"), ["c1s1", "c1s2", "c1s3"]);
    await kvSet(key("c2"), ["c2s1"]);
    const a = deferred<unknown>();
    idb.hook = (k) => (k === key("c1") ? a.promise : undefined);
    get.mockImplementation(async (url: string) => ({ rows: roomRows(String(url).includes("class=c1") ? "c1" : "c2") }));
    render(h(RandomPage, {}));
    await toRoom(/ป\.6\/2/);
    await waitFor(() => expect(body()).toContain("สุ่มแล้ว (1)")); // c2: 1 of 2
    await act(async () => { a.resolve(["c1s1", "c1s2", "c1s3"]); });
    await flush();
    expect(body()).toContain("สุ่มแล้ว (1)");
    expect(body()).toContain("ยังไม่ถูกสุ่ม (1)");
    // the next draw is the one child c2 has not had yet, and the saved list stays c2's
    await go();
    await waitFor(() => expect(body()).toContain("สุ่มแล้ว (2)"));
    expect([...(await kvGet<string[]>(key("c2")))!].sort()).toEqual(["c2s1", "c2s2"]);
  });

  it("while room c1's history is still being read nothing can be drawn (no 'drawn 0' guess)", async () => {
    const a = deferred<unknown>();
    idb.hook = (k) => (k === key("c1") ? a.promise : undefined);
    get.mockImplementation(async () => ({ rows: roomRows("c1") }));
    render(h(RandomPage, {}));
    await flush();
    expect(body()).toContain("สุ่มแล้ว (–)");
    await act(async () => { a.resolve([]); });
    await waitFor(() => expect(body()).toContain("สุ่มแล้ว (0)"));
  });
});

describe("a draw or a skip in flight when the room changes (clearTimers + epoch, as a pair)", () => {
  it("a skip waiting its 700 ms: moving to c2 means no draw happens there and c2's history stays empty", async () => {
    // the skip button is a card that is off at first: switch it on
    settings.value = { theme: "light", sound_enabled: false, home_cards: "", random_cards: serializeLayout(toggleLayoutCard(defaultPageLayout("random") as never, "pass")) } as never;
    get.mockImplementation(async (url: string) => ({ rows: roomRows(String(url).includes("class=c1") ? "c1" : "c2") }));
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    await go();
    await waitFor(() => expect(body()).toContain("สุ่มแล้ว (1)"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /ข้ามคนนี้/ })); });
    expect(document.querySelector(".rnd-name")!.textContent).toMatch(/^ข้าม .* แล้ว$/);
    await toRoom(/ป\.6\/2/);
    await act(async () => { await new Promise((r) => setTimeout(r, 1000)); });
    expect(body()).toContain("สุ่มแล้ว (0)");
    expect(await kvGet<string[]>(key("c2"))).toEqual([]);
    expect(document.querySelector(".rnd-name")!.textContent).not.toMatch(/^ข้าม/);
  }, 15000);

  it("changing the mode while the names spin stops the draw: no result and no saved history afterwards", async () => {
    restore(); // real motion: the draw takes a couple of seconds
    get.mockImplementation(async () => ({ rows: roomRows("c1") }));
    render(h(RandomPage, {}));
    await waitFor(() => expect(body()).toContain("เฉพาะคนที่มา (3)"));
    await go();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /จับกลุ่ม/ })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 3600)); });
    expect(await kvGet<string[]>(key())).toEqual([]);
    expect(document.querySelector(".rnd-badge")).toBeNull();
  }, 15000);
});
