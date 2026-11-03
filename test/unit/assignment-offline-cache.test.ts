import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Assignment, Bootstrap } from "@shared/types";

vi.mock("@client/lib/api", () => ({ api: { post: vi.fn(async () => ({})) } }));

import { assignments, applyBootstrap, captureAssignmentContext, dropAssignment, loadBootstrapCached, logout, patchAssignment, upsertAssignment } from "@client/store";
import { kvGet, kvSet } from "@client/lib/idb";
import { dataEpoch } from "@client/lib/session";

const work = (id: string): Assignment => ({
  id, term_id: null, subject_id: null, type_id: null, title: `งาน ${id}`, unit: null,
  full_score: 10, assigned_date: null, due_date: null, note: null, publish_scores: true,
  status: "open", class_ids: ["c1"], created_at: 1, updated_at: 1, deleted_at: null,
});
const bootstrap = (): Bootstrap => ({
  settings: { school_name: "โรงเรียนทดสอบ", teacher_name: "ครูทดสอบ", app_title: "งานครบ", late_after: "08:30",
    theme: "light", accent: "blue", sound_enabled: false, accept_student_code_scan: false,
    parent_portal_enabled: false, onboarding_done: true, last_backup_at: "", period_times: "{}", home_cards: "", scan_cards: "", attendance_cards: "", random_cards: "" },
  terms: [], currentTermId: null, classes: [], subjects: [], workTypes: [], students: [],
  revokedTokens: {}, qrRotatedAt: {}, assignments: [work("old")], dataEpoch: 1, serverTime: 100,
});

beforeEach(async () => {
  await kvSet("loggedOut", false);
  const b = bootstrap();
  applyBootstrap(b);
  await kvSet("bootstrap", b);
});

describe("server-confirmed assignment changes survive an offline start", () => {
  it("restores a work created after the last bootstrap, with its full metadata", async () => {
    const created = { ...work("new"), title: "ทดสอบ iPad ออฟไลน์", full_score: 20 };
    await upsertAssignment(created);
    assignments.value = [];

    expect(await loadBootstrapCached()).toBe(true);
    expect(assignments.value).toEqual([created, work("old")]);
    expect((await kvGet<Bootstrap>("bootstrap"))?.settings.school_name).toBe("โรงเรียนทดสอบ");
  });

  it("keeps concurrent creates, score/status changes and confirmed deletion in the cache", async () => {
    await Promise.all([upsertAssignment(work("a")), upsertAssignment(work("b")), patchAssignment("old", { full_score: 30, status: "closed" })]);
    await dropAssignment("a");
    assignments.value = [];
    await loadBootstrapCached();

    expect(assignments.value.map((a) => a.id).sort()).toEqual(["b", "old"]);
    expect(assignments.value.find((a) => a.id === "old")).toMatchObject({ full_score: 30, status: "closed" });
    expect((await kvGet<Bootstrap>("bootstrap"))?.serverTime).toBe(100);
  });

  it("does not resurrect student data after sign-out", async () => {
    await logout();
    await upsertAssignment(work("late-response"));
    expect(await kvGet("bootstrap")).toBeNull();
    expect(await loadBootstrapCached()).toBe(false);
  });

  it("sign-out clears the cache even while an assignment change is being cached", async () => {
    await Promise.all([upsertAssignment(work("in-flight")), logout()]);
    expect(await kvGet("bootstrap")).toBeNull();
    expect(await loadBootstrapCached()).toBe(false);
  });

  it("does not mix an old data epoch's mutation into a newer cached restore", async () => {
    await kvSet("bootstrap", { ...bootstrap(), dataEpoch: 2 });
    dataEpoch.value = 1;
    await upsertAssignment(work("old-epoch"));
    expect((await kvGet<Bootstrap>("bootstrap"))?.assignments).toEqual([work("old")]);
  });

  it("ignores a reply whose request began before a restore replaced memory and cache", async () => {
    const request = captureAssignmentContext();
    const restored = { ...bootstrap(), dataEpoch: 2, assignments: [work("restored")] };
    applyBootstrap(restored);
    await kvSet("bootstrap", restored);

    expect(await upsertAssignment(work("late-response"), request)).toBe(false);
    await patchAssignment("restored", { status: "closed" }, request);
    await dropAssignment("restored", request);
    expect(assignments.value).toEqual([work("restored")]);
    expect((await kvGet<Bootstrap>("bootstrap"))?.assignments).toEqual([work("restored")]);
  });

  it("ignores a prior sign-in's late reply even if the next sign-in has the same epoch", async () => {
    const request = captureAssignmentContext();
    await logout();
    const signedIn = { ...bootstrap(), assignments: [work("next-sign-in")] };
    applyBootstrap(signedIn);
    await kvSet("loggedOut", false);
    await kvSet("bootstrap", signedIn);
    expect(await upsertAssignment(work("late-response"), request)).toBe(false);
    expect(assignments.value).toEqual([work("next-sign-in")]);
    expect((await kvGet<Bootstrap>("bootstrap"))?.assignments).toEqual([work("next-sign-in")]);
  });
});
