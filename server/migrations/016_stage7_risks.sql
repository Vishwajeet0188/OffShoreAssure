-- Stage 7, Risk identification (sequence diagram steps 29–32).
-- Step 29: the engine brings together the gaps from Stages 1–6.
-- Step 30: each risk is scored (likelihood × impact) with the evidence held.
-- Step 31: the buyer sees the risk register and the reason for each score.
-- Step 32: the snapshot is saved here, with the versions of every source it read.
--
-- Running it again after a source changes saves the next version; earlier
-- versions cannot be changed or deleted.

CREATE TABLE risk_registers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id      uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  version            integer NOT NULL,
  inputs             jsonb NOT NULL,      -- versions of the requirement, selection, compliance result, contract, register, transfers
  rule_pack_version  text NOT NULL,
  overall            jsonb NOT NULL,      -- the highest rating
  totals             jsonb NOT NULL,
  grid               jsonb NOT NULL,      -- 5 × 5 counts, [likelihood][impact]
  risks              jsonb NOT NULL,      -- each risk with its score, rationale and linked sources
  snapshot_sha256    text NOT NULL,
  created_by         uuid NOT NULL REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, version)
);

CREATE TRIGGER risk_registers_no_update BEFORE UPDATE OR DELETE ON risk_registers
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION contract_records_immutable();
