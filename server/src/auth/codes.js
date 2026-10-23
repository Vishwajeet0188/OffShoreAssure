import crypto from 'node:crypto';
import { config } from '../config.js';

export const hashCode = (userId, purpose, code) =>
  crypto.createHmac('sha256', config.codeSecret).update(`${userId}:${purpose}:${code}`).digest('hex');

export function newCode() {
  return String(crypto.randomInt(0, 10 ** config.codeLength)).padStart(config.codeLength, '0');
}

/* Creates a fresh code (older unused codes for the same purpose stop working). Returns the plain code. */
export async function issueCode(db, userId, purpose) {
  const code = newCode();
  await db.query('UPDATE verification_codes SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL', [userId, purpose]);
  await db.query(
    `INSERT INTO verification_codes (user_id, purpose, code_hash, expires_at) VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
    [userId, purpose, hashCode(userId, purpose, code), config.codeTtlMinutes]
  );
  return code;
}

/* Seconds the user must still wait before another code can be sent (0 = can send now). */
export async function cooldownLeft(db, userId, purpose) {
  const r = await db.query(
    `SELECT GREATEST(0, $3 - EXTRACT(EPOCH FROM (now() - created_at)))::int AS left
       FROM verification_codes WHERE user_id = $1 AND purpose = $2 ORDER BY created_at DESC LIMIT 1`,
    [userId, purpose, config.resendCooldownSeconds]
  );
  return r.rows[0] ? r.rows[0].left : 0;
}

/* Checks a code. Returns { ok } or { ok:false, reason, attemptsLeft }. Counts attempts. */
export async function checkCode(db, userId, purpose, code) {
  const r = await db.query(
    `SELECT id, code_hash, attempts, expires_at < now() AS expired FROM verification_codes
      WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [userId, purpose]
  );
  const row = r.rows[0];
  if (!row) return { ok: false, reason: 'no_code' };
  if (row.expired) return { ok: false, reason: 'expired' };
  if (row.attempts >= config.codeMaxAttempts) return { ok: false, reason: 'too_many_attempts', attemptsLeft: 0 };
  const given = hashCode(userId, purpose, String(code || '').trim());
  const match = given.length === row.code_hash.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(row.code_hash));
  if (!match) {
    const attempts = row.attempts + 1;
    await db.query('UPDATE verification_codes SET attempts = $2 WHERE id = $1', [row.id, attempts]);
    const left = Math.max(0, config.codeMaxAttempts - attempts);
    return { ok: false, reason: left ? 'wrong_code' : 'too_many_attempts', attemptsLeft: left };
  }
  await db.query('UPDATE verification_codes SET used_at = now() WHERE id = $1', [row.id]);
  return { ok: true };
}
