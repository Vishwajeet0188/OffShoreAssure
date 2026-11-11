-- Stage 3 rewrite to the client specification "Stage 3 Inputs and Outputs" (steps 10–16).
-- Assessments started before this migration keep their saved questionnaire and rule pack (RP-2026.10-S3-draft).

-- Step 10: the 8 start fields (assessment ID and vendor ID are already on the row).
ALTER TABLE compliance_assessments
  ADD COLUMN assessment_type text CHECK (assessment_type IN ('initial', 'renewal', 'event-driven')),
  ADD COLUMN service_scope text,
  ADD COLUMN processing_role text CHECK (processing_role IN ('controller', 'processor', 'subprocessor', 'unknown')),
  ADD COLUMN jurisdictions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN reviewer_id uuid REFERENCES users(id),
  ADD COLUMN target_completion_on date;

-- 'clarification': the reviewer asked the vendor to look again at some controls (a new version follows).
ALTER TABLE compliance_assessments DROP CONSTRAINT compliance_assessments_status_check;
ALTER TABLE compliance_assessments ADD CONSTRAINT compliance_assessments_status_check
  CHECK (status IN ('requested', 'in_progress', 'submitted', 'clarification'));

-- Step 12: each request sent to the vendor (the first one, clarifications and re-issues).
-- The secure access token is only stored as a SHA-256 hash. It expires and can be revoked.
CREATE TABLE compliance_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- Request ID
  compliance_id         uuid NOT NULL REFERENCES compliance_assessments(id) ON DELETE CASCADE,
  kind                  text NOT NULL CHECK (kind IN ('initial', 'clarification', 'reissue')),
  contact_email         text,
  questionnaire_version text NOT NULL,
  control_ids           text[] NOT NULL,
  requested_documents   jsonb NOT NULL,
  due_on                date NOT NULL,
  message               text,
  token_hash            text NOT NULL UNIQUE,
  expires_at            timestamptz NOT NULL,
  revoked_at            timestamptz,
  revoked_by            uuid REFERENCES users(id),
  deliveries            jsonb NOT NULL DEFAULT '[]'::jsonb,         -- notification delivery: to, status, at
  created_by            uuid NOT NULL REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX compliance_requests_c ON compliance_requests (compliance_id, created_at DESC);

-- Step 13: answers may hold structured values (registration number, tables, countries, hours, amounts).
ALTER TABLE compliance_answers DROP CONSTRAINT compliance_answers_answer_check;
ALTER TABLE compliance_answers ADD COLUMN value jsonb;

-- Step 13: the 9 fields per evidence item and the result of the automatic checks.
-- Evidence sent after the first submission is never deleted: a new upload is a new version.
ALTER TABLE compliance_evidence
  ADD COLUMN issuer            text,
  ADD COLUMN issued_on         date,
  ADD COLUMN version           integer NOT NULL DEFAULT 1,
  ADD COLUMN processing_status text,
  ADD COLUMN checks            jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN facts             jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN duplicate_of      uuid REFERENCES compliance_evidence(id),
  ADD COLUMN locked            boolean NOT NULL DEFAULT false,
  ADD COLUMN review_status     text CHECK (review_status IN ('VERIFIED', 'REJECTED')),
  ADD COLUMN review_note       text,
  ADD COLUMN reviewed_by       uuid REFERENCES users(id),
  ADD COLUMN reviewed_at       timestamptz;

-- Step 15: ComplianceAssessmentSnapshot version (1.0 on submission, 1.1 after a review, 2.0 after a resubmission).
ALTER TABLE compliance_results ADD COLUMN snapshot_version text;
