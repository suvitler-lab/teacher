// T-29: home_cards per layout (G10): saving or resetting one layout never touches the others or the old fields.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { put } = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock("@client/lib/api", async (orig) => ({ ...await orig<typeof import("@client/lib/api")>(), api: { get: vi.fn(), post: vi.fn(), put } }));
vi.mock("@client/lib/notify", async (orig) => ({ ...await orig<typeof import("@client/lib/notify")>(), ok: vi.fn(), err: vi.fn() }));

import { saveHomeCardsText, saveLayoutCards, resetLayoutCards, saveHomeCards, savedLayoutCards } from "@client/lib/homePrefs";
import { defaultHomeCards } from "@client/lib/homeCards";
import { settings } from "@client/store";
import type { Settings } from "@shared/types";

const base = (home_cards: string): Settings => ({
  school_name: "", teacher_name: "", app_title: "งานครบ", late_after: "08:30", theme: "system", accent: "blue",
  sound_enabled: false, accept_student_code_scan: false, parent_portal_enabled: false, onboarding_done: true,
  last_backup_at: "", period_times: "", home_cards, scan_cards: "", attendance_cards: "", random_cards: "", gradebook_cards: "", reports_cards: "", students_cards: "", settings_cards: "",
});
const sent = () => JSON.parse(put.mock.calls.at(-1)![1].home_cards);

beforeEach(() => { vi.clearAllMocks(); put.mockReset(); put.mockResolvedValue({}); Object.defineProperty(navigator, "onLine", { value: true, configurable: true }); });

describe("home_cards per layout", () => {
  it("saving layout b from an empty setting keeps the old fields an older app reads", async () => {
    settings.value = base("");
    await saveLayoutCards("b", { order: ["follow", "absent"], hidden: [] });
    const j = sent();
    expect(j.v).toBe(1);
    expect(j.order).toEqual(defaultHomeCards().order);
    expect(j.hidden).toEqual(defaultHomeCards().hidden);
    expect(j.b).toEqual({ order: ["follow", "absent"], hidden: [] });
    expect(j.a).toBeUndefined();
  });
  it("resetting the layout in use forgets only that layout", async () => {
    settings.value = base(JSON.stringify({ v: 1, order: ["att", "open"], hidden: ["term"], a: { order: ["x"], hidden: [] }, b: { order: ["y"], hidden: ["y"] }, c: { order: ["z"], hidden: [] } }));
    await resetLayoutCards("b");
    const j = sent();
    expect(j.b).toBeUndefined();
    expect(j.a).toEqual({ order: ["x"], hidden: [] });
    expect(j.c).toEqual({ order: ["z"], hidden: [] });
    expect(j.order).toEqual(["att", "open"]);
    expect(savedLayoutCards("b")).toBeUndefined();
    expect(savedLayoutCards("a")).toEqual({ order: ["x"], hidden: [] });
  });
  it("the old whole-page save keeps the per-layout fields", async () => {
    settings.value = base(JSON.stringify({ v: 1, order: ["att", "open"], hidden: [], c: { order: ["z"], hidden: [] } }));
    await saveHomeCards({ v: 1, order: ["open", "att"], hidden: ["att"] });
    const j = sent();
    expect(j).toMatchObject({ v: 1, order: ["open", "att"], hidden: ["att"], c: { order: ["z"], hidden: [] } });
  });
  it("a failed save goes back and the other layouts are untouched", async () => {
    const before = JSON.stringify({ v: 1, order: ["att"], hidden: [], a: { order: ["x"], hidden: [] } });
    settings.value = base(before);
    put.mockRejectedValueOnce(new Error("x"));
    expect(await resetLayoutCards("a")).toBe(false);
    expect(settings.value?.home_cards).toBe(before);
  });
  it("two saves that both fail go back to the value the server confirmed, not to the middle one (R-03)", async () => {
    settings.value = base("server");
    put.mockRejectedValue(new Error("down"));
    const a = saveHomeCardsText("first");
    const b = saveHomeCardsText("second");
    expect(settings.value?.home_cards).toBe("second");
    expect(await a).toBe(false);
    expect(await b).toBe(false);
    expect(settings.value?.home_cards).toBe("server");
  });
  it("a first save that fails and a second that works keep the second", async () => {
    settings.value = base("server");
    put.mockRejectedValueOnce(new Error("x"));
    const a = saveHomeCardsText("first");
    const b = saveHomeCardsText("second");
    expect([await a, await b]).toEqual([false, true]);
    expect(settings.value?.home_cards).toBe("second");
  });
  it("after a success the next failure goes back to that success", async () => {
    settings.value = base("server");
    expect(await saveHomeCardsText("ok")).toBe(true);
    put.mockRejectedValueOnce(new Error("x"));
    expect(await saveHomeCardsText("bad")).toBe(false);
    expect(settings.value?.home_cards).toBe("ok");
  });
});
