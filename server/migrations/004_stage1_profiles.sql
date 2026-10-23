-- Stage 1, Step 3: save the requirement profile (versioned snapshot) and the initial assessment timeline.

-- Documents uploaded from now on are encrypted at rest; earlier files are marked as not encrypted.
ALTER TABLE requirement_documents ADD COLUMN encrypted boolean NOT NULL DEFAULT false;
ALTER TABLE requirement_documents ALTER COLUMN encrypted SET DEFAULT true;

-- The 15 stored fields. A profile version is never changed or deleted: corrections create a new version.
CREATE TABLE requirement_profiles (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),           -- Profile ID
  assessment_id          uuid NOT NULL REFERENCES assessments(id),            -- Assessment ID (parent)
  version                text NOT NULL,                                       -- Profile version: 1.0, 1.1, …
  original_submission    jsonb NOT NULL,                                      -- answers exactly as submitted
  normalised_requirement jsonb NOT NULL,                                      -- machine-readable profile
  rule_pack_ids          text[] NOT NULL,                                     -- applicable rule packs
  rule_pack_versions     text[] NOT NULL,                                     -- versions, for traceability
  control_ids            text[] NOT NULL,                                     -- applicable assurance controls
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid NOT NULL REFERENCES users(id),
  source_documents       jsonb NOT NULL DEFAULT '[]'::jsonb,                  -- file references
  document_hashes        text[] NOT NULL DEFAULT '{}',                        -- SHA-256
  validation_findings    jsonb NOT NULL,                                      -- pass / fail / unknown per check
  missing_information    jsonb NOT NULL DEFAULT '[]'::jsonb,                  -- open gaps
  previous_version       uuid REFERENCES requirement_profiles(id),            -- change history (null for 1.0)
  change_reason          text,
  snapshot_sha256        text NOT NULL,                                       -- fingerprint of the normalised profile
  UNIQUE (assessment_id, version)
);

CREATE FUNCTION requirement_profiles_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'requirement_profiles is append-only: corrections create a new version';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER requirement_profiles_no_update BEFORE UPDATE OR DELETE ON requirement_profiles
  FOR EACH ROW EXECUTE FUNCTION requirement_profiles_immutable();

-- Assessment timeline: what has happened (events) and what comes next (milestones).
CREATE TABLE assessment_timeline (
  id             bigserial PRIMARY KEY,
  assessment_id  uuid NOT NULL REFERENCES assessments(id),
  kind           text NOT NULL CHECK (kind IN ('event', 'milestone')),
  stage          integer NOT NULL,
  step           integer,
  title          text NOT NULL,
  status         text NOT NULL CHECK (status IN ('done', 'next', 'pending')),
  at             timestamptz,
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX assessment_timeline_a ON assessment_timeline (assessment_id, id);
