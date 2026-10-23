import { query } from './db.js';

/* Evidence Record: every registration, login and admin action is written here.
   The table is append-only (enforced by a database trigger). */
export async function audit(req, event, { actor = null, detail = {}, stage = 'stage-0', ref = null, db = null } = {}) {
  const who = actor || req?.user || null;
  const run = db ? db.query.bind(db) : query;
  await run(
    'INSERT INTO audit_events (actor_id, actor_email, event, detail, ip, stage, ref) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [who?.id || null, who?.email || null, event, JSON.stringify(detail), req?.ip || null, stage, ref]
  );
}
