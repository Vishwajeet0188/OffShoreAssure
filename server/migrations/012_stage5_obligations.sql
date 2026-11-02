-- Stage 5, Obligation extraction (sequence diagram steps 21–24).
-- Step 21: the engine extracts obligations and parties from the Stage 4 clauses.
-- Step 22: clauses are mapped to the requirement's controls and to rules.
-- Step 23: the buyer sees the obligations with their source clause and confidence.
-- Step 24: the obligation register and the rule trace are saved here.
--
-- Each register is built from one contract version. Running it again (for
-- example after a new contract version) saves the next register version; earlier
-- versions are kept and cannot be changed.

CREATE TABLE obligation_registers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id     uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  contract_id       uuid NOT NULL REFERENCES contract_documents(id),
  contract_version  integer NOT NULL,
  version           integer NOT NULL,
  rule_pack_version text NOT NULL,
  totals            jsonb NOT NULL,       -- counts by type and party, rules covered, gaps
  obligations       jsonb NOT NULL,       -- every obligation with its source clause
  rule_trace        jsonb NOT NULL,       -- each rule: covered or not, and by which obligations
  gaps              jsonb NOT NULL,       -- rules that apply but have no obligation
  snapshot_sha256   text NOT NULL,        -- fingerprint of this register
  created_by        uuid NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, version)
);

CREATE TRIGGER obligation_registers_no_update BEFORE UPDATE OR DELETE ON obligation_registers
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION contract_records_immutable();
