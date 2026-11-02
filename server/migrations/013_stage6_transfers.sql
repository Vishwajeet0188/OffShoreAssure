-- Stage 6, Transfer assessment (sequence diagram steps 25–28).
-- Step 25: the engine maps data flows and transfer routes.
-- Step 26: recipients, roles and safeguards are checked route by route.
-- Step 27: the buyer sees the findings and the questions to ask.
-- Step 28: the route-by-route assessment is saved here.
--
-- Each version records which inputs it used (requirement, vendor selection,
-- contract and obligation register versions). Running it again after one of
-- them changes saves the next version; earlier versions cannot be changed.

CREATE TABLE transfer_assessments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id        uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  version              integer NOT NULL,
  inputs               jsonb NOT NULL,      -- versions of the requirement, selection, contract and register used
  rule_pack_version    text NOT NULL,
  overall              jsonb NOT NULL,      -- the most serious route status
  totals               jsonb NOT NULL,
  routes               jsonb NOT NULL,      -- each route with its checks and questions
  findings             jsonb NOT NULL,
  questions            jsonb NOT NULL,
  contract_terms       jsonb NOT NULL,      -- what the contract says about transfers
  snapshot_sha256      text NOT NULL,
  created_by           uuid NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, version)
);

CREATE TRIGGER transfer_assessments_no_update BEFORE UPDATE OR DELETE ON transfer_assessments
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION contract_records_immutable();
