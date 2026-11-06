-- Stage 1, Step 2: validate the submitted requirement and create the Assessment ID with its 15 system fields.

-- Buyer organisations (Buyer ID). One row per organisation name; users are linked through their profile.
CREATE TABLE organisations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  sector      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX organisations_name_unique ON organisations (lower(name));
ALTER TABLE user_profiles ADD COLUMN organisation_id uuid REFERENCES organisations(id);

-- Backfill organisations for existing buyers (admins belong to the OffshoreAssure team, not a buyer organisation).
INSERT INTO organisations (name, sector)
  SELECT DISTINCT ON (lower(trim(p.organisation_name))) trim(p.organisation_name), p.sector
    FROM user_profiles p JOIN users u ON u.id = p.user_id
   WHERE NOT u.is_admin AND p.organisation_name IS NOT NULL AND trim(p.organisation_name) <> ''
   ORDER BY lower(trim(p.organisation_name)), p.updated_at
ON CONFLICT DO NOTHING;
UPDATE user_profiles p SET organisation_id = o.id
  FROM organisations o, users u
 WHERE u.id = p.user_id AND NOT u.is_admin AND lower(o.name) = lower(trim(p.organisation_name));

-- Readable reference counters, one per prefix and year (e.g. OA-UK-2026 → 000142).
CREATE TABLE assessment_counters (
  prefix  text PRIMARY KEY,
  last    integer NOT NULL
);

CREATE TABLE assessments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),       -- Assessment ID (UUID)
  reference                   text NOT NULL UNIQUE,                             -- Assessment ID (readable), generated once
  requirement_id              uuid NOT NULL UNIQUE REFERENCES requirements(id), -- one assessment per submitted requirement
  buyer_id                    uuid NOT NULL REFERENCES organisations(id),       -- Buyer ID
  requirement_version         text NOT NULL DEFAULT '1.0',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid NOT NULL REFERENCES users(id),
  service_code                text NOT NULL,
  data_classification         text NOT NULL,
  risk_tier                   text NOT NULL,                                    -- preliminary risk tier
  jurisdiction_packs          text[] NOT NULL DEFAULT '{}',
  rule_pack_version           text NOT NULL,
  vendor_assessment_required  boolean NOT NULL,
  contract_review_required    boolean NOT NULL,
  transfer_review_required    boolean NOT NULL,
  validation_status           text NOT NULL CHECK (validation_status IN ('VALID', 'INCOMPLETE', 'INVALID')),
  missing_fields              jsonb NOT NULL DEFAULT '[]'::jsonb,
  findings                    jsonb NOT NULL DEFAULT '{}'::jsonb,               -- reasons, contradictions, legal screening
  idempotency_key             text NOT NULL UNIQUE
);
CREATE INDEX assessments_buyer ON assessments (buyer_id, created_at DESC);
