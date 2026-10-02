import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
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

  describe("hide / show several at once", () => {
    const mk = (id: string) => ({ id, subject_id: "s1", type_id: "wt_worksheet", title: "งาน " + id, full_score: 10, status: "open", class_ids: ["c1"], term_id: "t1" });
    const published = async () => Object.fromEntries(((await (await call("/api/bootstrap", {}, cookie)).json()) as any).assignments.map((a: any) => [a.id, a.publish_scores]));

    it("hides every work named, skips deleted work, and shows them again", async () => {
      await call("/api/assignments", json(mk("b1")), cookie);
      await call("/api/assignments", json(mk("b2")), cookie);
      await call("/api/assignments", json(mk("b3")), cookie);
      await call("/api/assignments/b3/delete", json({}), cookie);
      const hide = await call("/api/assignments/publish", json({ ids: ["a1", "b1", "b2", "b3"], publish: false }), cookie);
      expect(hide.status).toBe(200);
      expect(((await hide.json()) as any).changed).toBe(3); // the deleted one is not counted
      expect(await published()).toMatchObject({ a1: false, b1: false, b2: false });
      const gone = await env.DB.prepare("SELECT publish_scores AS p FROM assignments WHERE id = 'b3'").first<{ p: number }>();
      expect(gone?.p).toBe(1); // untouched
      const show = await call("/api/assignments/publish", json({ ids: ["a1", "b1", "b2"], publish: true }), cookie);
      expect(((await show.json()) as any).changed).toBe(3);
      expect(await published()).toMatchObject({ a1: true, b1: true, b2: true });
    });

    it("work already in the wanted state is not changed again and leaves no audit line", async () => {
      await call("/api/assignments/publish", json({ ids: ["a1"], publish: false }), cookie);
      const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE assignment_id = 'a1'").first<{ n: number }>();
      const again = await call("/api/assignments/publish", json({ ids: ["a1"], publish: false }), cookie);
      expect(((await again.json()) as any).changed).toBe(0);
      const after = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE assignment_id = 'a1'").first<{ n: number }>();
      expect(after?.n).toBe(before?.n);
    });

    it("writes one audit line per work that changed, with before and after", async () => {
      await call("/api/assignments", json(mk("b1")), cookie);
      await call("/api/assignments/publish", json({ ids: ["a1", "b1"], publish: false }), cookie);
      const rows = await env.DB.prepare("SELECT assignment_id AS a, before_json AS b, after_json AS f FROM audit_logs WHERE after_json LIKE '%publish_scores%' ORDER BY assignment_id").all<any>();
      expect(rows.results.map((r) => r.a)).toEqual(["a1", "b1"]);
      expect(JSON.parse(rows.results[0].b)).toEqual({ publish_scores: true });
      expect(JSON.parse(rows.results[0].f)).toEqual({ publish_scores: false });
    });

    it("refuses an empty or oversized list, and needs a signed-in teacher", async () => {
      expect((await call("/api/assignments/publish", json({ ids: [], publish: false }), cookie)).status).toBe(422);
      expect((await call("/api/assignments/publish", json({ ids: Array.from({ length: 501 }, (_, i) => "x" + i), publish: false }), cookie)).status).toBe(422);
      expect((await call("/api/assignments/publish", json({ ids: ["a1"], publish: false }))).status).toBe(401);
    });

    it("is refused (423) while a restore holds the data, and changes nothing", async () => {
      await env.DB.prepare("UPDATE meta SET value = '1' WHERE key = 'maintenance'").run();
      const res = await call("/api/assignments/publish", json({ ids: ["a1"], publish: false }), cookie);
      expect(res.status).toBe(423);
      const row = await env.DB.prepare("SELECT publish_scores AS p FROM assignments WHERE id = 'a1'").first<{ p: number }>();
      expect(row?.p).toBe(1);
    });
  });
});
