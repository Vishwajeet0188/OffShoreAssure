/* Creates (or promotes) the OffshoreAssure admin account, sets its password and unlocks it.
   Usage (bash):        ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='Strong1234' npm run seed:admin
   Usage (PowerShell):  $env:ADMIN_EMAIL='admin@example.com'; $env:ADMIN_PASSWORD='Strong1234'; npm run seed:admin */
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { migrate } from './migrate.js';

const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';
if (!email || password.length < 8) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (min 8 characters).');
  process.exit(1);
}
await migrate({ log: false });
const hash = await bcrypt.hash(password, 12);
const r = await pool.query(
  `INSERT INTO users (email, password_hash, status, is_admin, role, email_verified_at) VALUES ($1, $2, 'active', true, 'admin', now())
   ON CONFLICT ((lower(email))) DO UPDATE
     SET password_hash = EXCLUDED.password_hash, status = 'active', is_admin = true, role = 'admin',
         failed_logins = 0, locked_until = NULL, updated_at = now()
   RETURNING id`,
  [email, hash],
);
await pool.query(
  `INSERT INTO user_profiles (user_id, full_name, organisation_name, sector, job_role) VALUES ($1, 'OffshoreAssure Admin', 'OffshoreAssure', 'Other', 'Other')
   ON CONFLICT (user_id) DO NOTHING`,
  [r.rows[0].id],
);
await pool.query(
  `INSERT INTO audit_events (actor_id, actor_email, event, stage) VALUES ($1, $2, 'admin.account_seeded', 'stage-0')`,
  [r.rows[0].id, email],
);
console.log('Admin ready:', email);
await pool.end();
