import { describe, it, expect, beforeEach } from "vitest";
import { call, json, login, seed } from "./helpers";

describe("hide / show scores of an assignment", () => {
  let cookie: string;
  beforeEach(async () => { cookie = await login(); await seed(); });

  it("publish_scores false is saved, comes back in the bootstrap, and can be switched back on", async () => {
    const base = { id: "a1", subject_id: "s1", type_id: "wt_worksheet", title: "ใบงาน 1", full_score: 10, status: "open", class_ids: ["c1"], term_id: "t1" };
    const hide = await call("/api/assignments", json({ ...base, publish_scores: false }), cookie);
    expect(((await hide.json()) as any).assignment.publish_scores).toBe(false);
    const boot1 = (await (await call("/api/bootstrap", {}, cookie)).json()) as any;
    expect(boot1.assignments.find((a: any) => a.id === "a1").publish_scores).toBe(false);
    await call("/api/assignments", json({ ...base, publish_scores: true }), cookie);
    const boot2 = (await (await call("/api/bootstrap", {}, cookie)).json()) as any;
    expect(boot2.assignments.find((a: any) => a.id === "a1").publish_scores).toBe(true);
  });
});
