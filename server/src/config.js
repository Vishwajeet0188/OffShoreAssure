import 'dotenv/config';
import { fileURLToPath } from 'node:url';

const bool = (v, d = false) => (v == null || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));
const num = (v, d) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: num(process.env.PORT, 4000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://oa:oa@localhost:5432/offshoreassure',
  jwtSecret: process.env.JWT_SECRET || (isProd ? null : 'dev-only-change-me'),
  codeSecret: process.env.CODE_SECRET || process.env.JWT_SECRET || (isProd ? null : 'dev-only-code-secret'),
  sessionHours: num(process.env.SESSION_HOURS, 8),
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  cookieSameSite: process.env.COOKIE_SAMESITE || 'lax',
  cookieSecure: bool(process.env.COOKIE_SECURE, isProd),

  // Verification code rules (pending confirmation from Mukesh; same as ScotWarm).
  codeLength: 6,
  codeTtlMinutes: num(process.env.CODE_TTL_MINUTES, 10),
  codeMaxAttempts: num(process.env.CODE_MAX_ATTEMPTS, 5),
  resendCooldownSeconds: num(process.env.RESEND_COOLDOWN_SECONDS, 60),

  // Login lockout.
  maxFailedLogins: num(process.env.MAX_FAILED_LOGINS, 5),
  lockMinutes: num(process.env.LOCK_MINUTES, 15),

  // Pending decision: does an admin approve new users before they can sign in?
  requireAdminApproval: bool(process.env.REQUIRE_ADMIN_APPROVAL, false),

  // Email: SMTP when configured; otherwise codes are printed in the server console (development only).
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'OffshoreAssure <no-reply@offshoreassure.local>'
  },
  // Development/demo only: return the code to the browser so the flow can be tested without email.
  devShowCodes: !isProd && bool(process.env.DEV_SHOW_CODES, false),
  rateLimit: bool(process.env.RATE_LIMIT, true),
  // Uploaded documents (Stage 1 onwards). Keep outside the web root; never commit it.
  storageDir: process.env.STORAGE_DIR || fileURLToPath(new URL('../storage/', import.meta.url)),
  // AES-256-GCM key for stored documents: 64 hex characters. In development a key is derived from JWT_SECRET.
  storageKey: process.env.STORAGE_ENCRYPTION_KEY || (isProd ? null : 'derive')
};

if (isProd && (!config.jwtSecret || !config.codeSecret || !config.storageKey)) {
  throw new Error('JWT_SECRET, CODE_SECRET and STORAGE_ENCRYPTION_KEY must be set in production.');
}
