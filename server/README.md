# OffshoreAssure API (Express + PostgreSQL)

The backend for OffshoreAssure. **Stage 0** covers customer registration with an emailed verification code, login, forgot password, the "Complete your profile" step, the admin-only **Registered Users** list, and an append-only audit trail (the Evidence Record).

## Requirements

- Node.js 20.19 or newer
- PostgreSQL 14 or newer. Either install it locally, or run the `docker-compose.yml` at the repo root with `docker compose up -d`.

## First-time setup (Windows PowerShell)

```powershell
cd server
npm install
copy .env.example .env      # then edit .env (see below)

# Create the database. With a local PostgreSQL install, in psql as the postgres user:
#   CREATE USER oa WITH PASSWORD 'oa' CREATEDB;
#   CREATE DATABASE offshoreassure OWNER oa;
# With Docker: docker compose up -d   (creates the same user and database)

npm run migrate             # creates the tables
$env:ADMIN_EMAIL="you@novtekconsulting.in"; $env:ADMIN_PASSWORD="ChooseAStrong1"; npm run seed:admin
npm run dev                 # API on http://localhost:4000/api
```

Then, in a second terminal, start the React app:

```powershell
cd offshoreassure
npm install
npm run dev                 # http://localhost:5173  (Vite forwards /api to port 4000)
```

## Email codes in development

If `SMTP_HOST` is empty, no email is sent. The code is printed in the API terminal instead, as a line like `[DEV EMAIL] register code for x@y.com: 123456`.

To also show the code inside the popup during demos, set `DEV_SHOW_CODES=true`. This setting is ignored in production.

To send real emails, fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`. You can use the same SMTP service as ScotWarm if Mukesh confirms that.

## Settings waiting for Mukesh's confirmation

| Setting | Default | Query |
| --- | --- | --- |
| `REQUIRE_ADMIN_APPROVAL` | `false` (users can sign in straight after verifying their email) | 3 |
| `CODE_TTL_MINUTES`, `CODE_MAX_ATTEMPTS`, `RESEND_COOLDOWN_SECONDS` | 10, 5, 60 | 6 |
| Admin actions | Activate and deactivate only. Delete is not built yet. | 4 |
| Hosting | Local for now. Production must use a UK-region database and server. | 5 |

## API (all under `/api`)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | `{ email, password }` sends a 6-digit code |
| POST | `/auth/verify` | `{ email, code }` activates the account and signs the user in |
| POST | `/auth/resend-code` | `{ email, purpose: register \| reset }` |
| POST | `/auth/login` | `{ email, password }` |
| POST | `/auth/logout` | |
| POST | `/auth/forgot-password` | `{ email }` |
| POST | `/auth/reset-password` | `{ email, code, newPassword }` |
| GET | `/me` | Current user and profile |
| PUT | `/me/profile` | `{ fullName, organisationName, sector, jobRole, phone }` |
| GET | `/admin/users?search=&status=&page=` | Registered Users (admin only) |
| PATCH | `/admin/users/:id` | `{ status: active \| inactive }` (admin only) |
| GET | `/admin/audit` | Latest audit events (admin only) |
| GET | `/health` | Health check |

## Security

- **Passwords:** stored with bcrypt.
- **Verification codes:** stored only as HMAC hashes. Each code expires after 10 minutes and allows at most 5 attempts.
- **Sessions:** a JWT in an httpOnly cookie, valid for 8 hours.
- **Rate limits and lockout:** the auth endpoints are rate-limited. After 5 wrong passwords the account is locked for 15 minutes.
- **Login messages:** the same message is shown for an unknown email and a wrong password. Forgot password never reveals whether an email is registered.
- **Admin access:** admin endpoints check `is_admin` on the server.
- **Audit trail:** `audit_events` is append-only. A database trigger blocks UPDATE and DELETE.

## Tests

```powershell
# needs an empty test database: CREATE DATABASE offshoreassure_test OWNER oa;
$env:TEST_DATABASE_URL="postgres://oa:oa@localhost:5432/offshoreassure_test"; npm test
```

There are 11 tests. They cover registration, wrong, expired and too-many codes, resend, hashed storage, login, lockout, password reset, profile, admin access, and audit immutability.
