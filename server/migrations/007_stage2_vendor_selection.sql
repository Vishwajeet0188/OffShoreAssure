-- Stage 2, Vendor selection (sequence diagram steps 5–9).
-- Step 5: the buyer searches verified vendors or invites one by email.
-- Step 6–7: the engine matches service, location and scope; the buyer builds a shortlist (candidate list) and compares.
-- Step 8–9: the buyer confirms one vendor with a reason; the selection is saved as an immutable, versioned record.

-- Vendors invited by a buyer for an assessment (they may not be on OffshoreAssure yet).
CREATE TABLE vendor_invitations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id  uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  email          text NOT NULL,
  company_name   text NOT NULL,
  message        text,
  invited_by     uuid NOT NULL REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  vendor_id      uuid REFERENCES organisations(id),       -- set when the invited company is (or becomes) a vendor on OffshoreAssure
  linked_at      timestamptz,
  status         text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'joined', 'cancelled'))
);
CREATE UNIQUE INDEX vendor_invitations_once ON vendor_invitations (assessment_id, lower(email)) WHERE status <> 'cancelled';
CREATE INDEX vendor_invitations_email ON vendor_invitations (lower(email));

-- Candidate list for an assessment (working list; adding and removing is audited).
CREATE TABLE vendor_shortlist (
  assessment_id  uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  vendor_id      uuid NOT NULL REFERENCES organisations(id),
  added_by       uuid NOT NULL REFERENCES users(id),
  added_at       timestamptz NOT NULL DEFAULT now(),
  source         text NOT NULL DEFAULT 'search' CHECK (source IN ('search', 'invitation')),
  PRIMARY KEY (assessment_id, vendor_id)
);

-- Step 9: the saved selection and its decision rationale. Never changed or deleted: changing vendor creates a new version.
CREATE TABLE vendor_selections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id      uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  version            integer NOT NULL,
  vendor_id          uuid NOT NULL REFERENCES organisations(id),
  vendor_snapshot    jsonb NOT NULL,            -- the vendor's profile at the time of selection
  match              jsonb NOT NULL,            -- step 6 result for the selected vendor
  candidates         jsonb NOT NULL,            -- step 7 shortlist with match results at the time of selection
  rationale          text NOT NULL,
  accepted_flags     jsonb NOT NULL DEFAULT '[]',  -- match issues the buyer explicitly accepted
  requirement_version text NOT NULL,
  rule_pack_version  text NOT NULL,
  selected_by        uuid NOT NULL REFERENCES users(id),
  selected_at        timestamptz NOT NULL DEFAULT now(),
  previous_id        uuid REFERENCES vendor_selections(id),
  change_reason      text,
  snapshot_sha256    text NOT NULL,
  UNIQUE (assessment_id, version)
);
CREATE FUNCTION vendor_selections_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'vendor_selections is append-only: a saved selection cannot be changed or deleted';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER vendor_selections_no_update BEFORE UPDATE OR DELETE ON vendor_selections
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION vendor_selections_immutable();

-- Current selection on the assessment (follows the latest version).
ALTER TABLE assessments
  ADD COLUMN selected_vendor_id uuid REFERENCES organisations(id),
  ADD COLUMN selection_version integer;
