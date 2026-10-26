-- Stage 9, Monitoring and audit (sequence diagram steps 39–43).
-- Step 39: the buyer chooses to generate the report or to continue monitoring.
-- Step 40: the report is compiled from the latest saved record of every stage, with the audit trail.
-- Step 41: each report is saved as a new version with a fingerprint. Never changed or deleted.
-- Step 42: the buyer views the report and downloads the audit pack.
-- Step 43: monitoring checks (expiring certificates, overdue actions, changed records, periodic review).

CREATE TABLE report_versions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id      uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  version            integer NOT NULL,
  reason             text NOT NULL,                 -- why this version was generated
  inputs             jsonb NOT NULL,                -- the version of every stage record it read
  rule_pack_version  text NOT NULL,
  position           jsonb NOT NULL,                -- the stated position (never "compliant")
  content            jsonb NOT NULL,                -- the full report
  audit_events       integer NOT NULL,              -- how many audit events it covers
  snapshot_sha256    text NOT NULL,
  created_by         uuid NOT NULL REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, version)
);

-- Step 43: every monitoring check that was run, and what it found. Never changed or deleted.
CREATE TABLE monitoring_checks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id      uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  report_version     integer,                       -- the latest report at the time, if any
  choice             text NOT NULL CHECK (choice IN ('monitor', 'check')),
  note               text,
  items              jsonb NOT NULL,
  rule_pack_version  text NOT NULL,
  created_by         uuid NOT NULL REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX monitoring_checks_assessment ON monitoring_checks (assessment_id, created_at);

CREATE FUNCTION stage9_records_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: a saved record cannot be changed or deleted', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER report_versions_no_update BEFORE UPDATE OR DELETE ON report_versions
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION stage9_records_immutable();
CREATE TRIGGER monitoring_checks_no_update BEFORE UPDATE OR DELETE ON monitoring_checks
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION stage9_records_immutable();
