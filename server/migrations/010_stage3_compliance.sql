-- Stage 3, Compliance assessment (sequence diagram steps 10–16).
-- Step 10: the buyer starts it for the selected vendor.  Step 11: control set + questionnaire generated (snapshot).
-- Step 12: request sent to the vendor.  Step 13: vendor answers and uploads evidence.  Step 14: validation + provisional score.
-- Step 15: responses, evidence and gaps saved (append-only result).  Step 16: results shown to the buyer.

CREATE TABLE compliance_assessments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id      uuid NOT NULL UNIQUE REFERENCES assessments(id) ON DELETE CASCADE,
  vendor_id          uuid NOT NULL REFERENCES organisations(id),
  selection_version  integer NOT NULL,
  requirement_version text NOT NULL,
  questionnaire      jsonb NOT NULL,          -- step 11 snapshot: controls and their questions
  rule_pack_version  text NOT NULL,
  status             text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'in_progress', 'submitted')),
  due_on             date NOT NULL,
  started_by         uuid NOT NULL REFERENCES users(id),
  started_at         timestamptz NOT NULL DEFAULT now(),
  submitted_by       uuid REFERENCES users(id),
  submitted_at       timestamptz
);

-- Step 13: the vendor's answers (editable until submitted).
CREATE TABLE compliance_answers (
  compliance_id  uuid NOT NULL REFERENCES compliance_assessments(id) ON DELETE CASCADE,
  question_id    text NOT NULL,
  answer         text NOT NULL CHECK (answer IN ('Yes', 'Partly', 'No')),
  comment        text,
  updated_by     uuid NOT NULL REFERENCES users(id),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (compliance_id, question_id)
);

-- Step 13: evidence documents (encrypted at rest, SHA-256 of the original file).
CREATE TABLE compliance_evidence (
  id             uuid PRIMARY KEY,
  compliance_id  uuid NOT NULL REFERENCES compliance_assessments(id) ON DELETE CASCADE,
  control_id     text NOT NULL,
  doc_type       text NOT NULL,
  file_name      text NOT NULL,
  mime_type      text NOT NULL,
  size_bytes     integer NOT NULL,
  sha256         text NOT NULL,
  storage_key    text NOT NULL,
  encrypted      boolean NOT NULL DEFAULT true,
  expires_on     date,
  uploaded_by    uuid NOT NULL REFERENCES users(id),
  uploaded_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX compliance_evidence_c ON compliance_evidence (compliance_id, control_id);

-- Steps 14–15: the scored result saved on submission. Never changed or deleted.
CREATE TABLE compliance_results (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compliance_id    uuid NOT NULL REFERENCES compliance_assessments(id) ON DELETE CASCADE,
  version          integer NOT NULL,
  overall_score    integer NOT NULL,
  rating           text NOT NULL,
  result           jsonb NOT NULL,           -- areas, controls, gaps, observations
  answers          jsonb NOT NULL,           -- snapshot of the answers
  evidence         jsonb NOT NULL,           -- snapshot of the evidence list (names, types, hashes, expiry)
  rule_pack_version text NOT NULL,
  snapshot_sha256  text NOT NULL,
  created_by       uuid NOT NULL REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (compliance_id, version)
);
CREATE FUNCTION compliance_results_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'compliance_results is append-only: a saved result cannot be changed or deleted';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER compliance_results_no_update BEFORE UPDATE OR DELETE ON compliance_results
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION compliance_results_immutable();
