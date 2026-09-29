import type { env } from "cloudflare:test";
import { expect } from "vitest";
import { call, callIn, json } from "./helpers";
import { BACKUP_TABLES } from "../../worker/routes/backup";

export type Snapshot = Record<string, any[]>;
export interface Backup { data: Snapshot; counts: Record<string, number> }

/** Read the whole database back through the real backup endpoint, page by page, like the app does. */
export async function takeBackup(cookie: string, via?: typeof env): Promise<Backup> {
  const data: Snapshot = {};
  const counts: Record<string, number> = {};
  for (const t of BACKUP_TABLES) {
    const rows: any[] = [];
    for (let cursor: number | null = 0; cursor !== null;) {
      const url = `/api/backup?table=${t}&cursor=${cursor}`;
      const page = (await (await (via ? callIn(via, url, {}, cookie) : call(url, {}, cookie))).json()) as any;
      rows.push(...page.rows);
      cursor = page.nextCursor;
    }
    data[t] = rows;
    counts[t] = rows.length;
  }
  return { data, counts };
}

/** validate → upload in chunks → commit, through the real endpoints. `commitEnv` runs only the commit (e.g. a metered database). */
export async function restoreFrom(cookie: string, b: Backup, opts: { commitEnv?: typeof env } = {}) {
  const v = (await (await call("/api/restore/validate", json({ manifest: { schema_version: 5, counts: b.counts } }), cookie)).json()) as any;
  expect(v.ok).toBe(true);
  for (const t of BACKUP_TABLES) {
    const rows = b.data[t];
    for (let i = 0, seq = 0; i < rows.length; i += 500, seq++) {
      const r = await call("/api/restore/execute", json({ restoreId: v.restoreId, step: "chunk", table: t, seq, rows: rows.slice(i, i + 500) }), cookie);
      expect(r.status).toBe(200);
    }
  }
  const commit = json({ restoreId: v.restoreId, step: "commit" });
  return opts.commitEnv ? callIn(opts.commitEnv, "/api/restore/execute", commit, cookie) : call("/api/restore/execute", commit, cookie);
}
