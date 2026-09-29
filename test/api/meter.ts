import { env } from "cloudflare:test";

export interface Meter {
  queries: number; rowsRead: number; rowsWritten: number; measured: boolean;
  /** each statement that ran, with what it cost — to find WHICH query is the expensive one */
  each: { sql: string; rowsRead: number; rowsWritten: number }[];
}

/**
 * A copy of the test env whose database counts what a request costs on the Free plan: how many statements it ran
 * (a batch counts every statement in it), and the rows D1 says it read and wrote (indexes included).
 * `stats.measured` is false if this runtime does not report row counts — then only `queries` is meaningful.
 */
export function metered(): { env: typeof env; stats: Meter } {
  const stats: Meter = { queries: 0, rowsRead: 0, rowsWritten: 0, measured: false, each: [] };
  const add = (meta: any, sql = "") => {
    stats.queries++;
    stats.each.push({ sql: sql.replace(/\s+/g, " ").trim(), rowsRead: meta?.rows_read ?? 0, rowsWritten: meta?.rows_written ?? 0 });
    if (meta && typeof meta.rows_read === "number") { stats.measured = true; stats.rowsRead += meta.rows_read; stats.rowsWritten += meta.rows_written ?? 0; }
  };
  const original = new WeakMap<object, D1PreparedStatement>();
  const sqlOf = new WeakMap<object, string>();
  const wrap = (stmt: D1PreparedStatement, sql: string): D1PreparedStatement => {
    const proxy: D1PreparedStatement = new Proxy(stmt, {
      get(target, prop) {
        if (prop === "bind") return (...a: unknown[]) => wrap(target.bind(...a), sql);
        if (prop === "all" || prop === "run") return async () => { const r = await (target as any)[prop](); add(r.meta, sql); return r; };
        if (prop === "first") return async (col?: string) => {
          const r = await target.all<any>();
          add(r.meta, sql);
          const row = (r.results ?? [])[0] ?? null;
          return col && row ? row[col] : row;
        };
        const v = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    original.set(proxy, stmt);
    sqlOf.set(proxy, sql);
    return proxy;
  };
  const DB = new Proxy(env.DB, {
    get(target, prop) {
      if (prop === "prepare") return (sql: string) => wrap(target.prepare(sql), sql);
      if (prop === "batch") return async (stmts: D1PreparedStatement[]) => {
        const results = await target.batch(stmts.map((s) => original.get(s) ?? s));
        results.forEach((r, i) => add((r as any).meta, sqlOf.get(stmts[i]) ?? ""));
        return results;
      };
      const v = Reflect.get(target, prop);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return { env: { ...env, DB } as typeof env, stats };
}
