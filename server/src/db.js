import pg from 'pg';
import { config } from './config.js';

// DATE columns (e.g. certificate expiry) are calendar dates: keep them as 'YYYY-MM-DD' strings, never shifted by time zone.
pg.types.setTypeParser(1082, v => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export const query = (text, params) => pool.query(text, params);

/* Runs fn inside a transaction and returns its result. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
