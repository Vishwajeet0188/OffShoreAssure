-- Stage 0: customer registration, email verification, login, admin users, audit trail.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text NOT NULL,
  password_hash      text NOT NULL,
  -- unverified: registered, email code not yet confirmed
  -- pending:    verified, waiting for admin approval (only when REQUIRE_ADMIN_APPROVAL=true)
  -- active:     can sign in
  -- inactive:   deactivated by an admin
  status             text NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified', 'pending', 'active', 'inactive')),
  is_admin           boolean NOT NULL DEFAULT false,
  email_verified_at  timestamptz,
  failed_logins      integer NOT NULL DEFAULT 0,
  locked_until       timestamptz,
  last_login_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

-- Details collected after registration ("Complete your profile").
CREATE TABLE user_profiles (
  user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name          text,
  organisation_name  text,
  sector             text,
  job_role           text,
  phone              text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- One-time email codes for registration and password reset. Only a hash of the code is stored.
CREATE TABLE verification_codes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose            text NOT NULL CHECK (purpose IN ('register', 'reset')),
  code_hash          text NOT NULL,
  expires_at         timestamptz NOT NULL,
  attempts           integer NOT NULL DEFAULT 0,
  used_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_codes_lookup ON verification_codes (user_id, purpose, created_at DESC);

-- Evidence Record lane: append-only audit trail shared by every stage.
CREATE TABLE audit_events (
  id                 bigserial PRIMARY KEY,
  at                 timestamptz NOT NULL DEFAULT now(),
  actor_id           uuid,
  actor_email        text,
  event              text NOT NULL,
  detail             jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip                 text,
  stage              text,
  ref                text
);
CREATE INDEX audit_events_at ON audit_events (at DESC);
CREATE INDEX audit_events_actor ON audit_events (actor_id, at DESC);

-- Audit rows can never be changed or removed.
CREATE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
