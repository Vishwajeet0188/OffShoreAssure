-- Stage 4, Contract analysis (sequence diagram steps 17–20).
-- Step 17: the buyer uploads the contract with the selected vendor.
-- Step 18: the engine extracts the text and identifies the clauses.
-- Step 19: the original file and the extraction are saved to the evidence record.
-- Step 20: the buyer sees the contract analysis and the clause list.
--
-- A newer contract (for example a signed copy, or a revised draft) is saved as the
-- next version. Earlier versions and their analyses are kept and cannot be changed.

CREATE TABLE contract_documents (
  id               uuid PRIMARY KEY,
  assessment_id    uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  vendor_id        uuid NOT NULL REFERENCES organisations(id),
  version          integer NOT NULL,
  label            text,                  -- e.g. "Signed copy", "Draft v2" (optional)
  change_reason    text,                  -- required from version 2 onwards
  file_name        text NOT NULL,
  mime_type        text NOT NULL,
  size_bytes       integer NOT NULL,
  sha256           text NOT NULL,         -- fingerprint of the original file
  storage_key      text NOT NULL,
  encrypted        boolean NOT NULL DEFAULT true,
  page_count       integer NOT NULL,
  word_count       integer NOT NULL,
  uploaded_by      uuid NOT NULL REFERENCES users(id),
  uploaded_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, version)
);

CREATE TABLE contract_analyses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id       uuid NOT NULL UNIQUE REFERENCES contract_documents(id) ON DELETE CASCADE,
  assessment_id     uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  rule_pack_version text NOT NULL,
  totals            jsonb NOT NULL,       -- clause counts
  clauses           jsonb NOT NULL,       -- every clause with its topics and key terms
  topics            jsonb NOT NULL,       -- each topic: found or not, and where
  not_found         jsonb NOT NULL,       -- expected topics with no clause
  text_sha256       text NOT NULL,        -- fingerprint of the extracted text
  snapshot_sha256   text NOT NULL,        -- fingerprint of this whole analysis
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contract_analyses_assessment ON contract_analyses (assessment_id);

-- Saved contracts and analyses are evidence: they are never edited or deleted.
CREATE FUNCTION contract_records_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: a saved contract or analysis cannot be changed or deleted', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER contract_documents_no_update BEFORE UPDATE OR DELETE ON contract_documents
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION contract_records_immutable();
CREATE TRIGGER contract_analyses_no_update BEFORE UPDATE OR DELETE ON contract_analyses
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION contract_records_immutable();
