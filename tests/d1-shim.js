// Minimal D1 stand-in on node:sqlite so the Worker can be exercised without wrangler.
import { DatabaseSync } from "node:sqlite";

export function createD1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql, params = []) => ({
    bind: (...p) => stmt(sql, p),
    first: async () => db.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...params) }),
    run: async () => {
      const r = db.prepare(sql).run(...params);
      return { success: true, meta: { changes: Number(r.changes) } };
    },
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  };
}
