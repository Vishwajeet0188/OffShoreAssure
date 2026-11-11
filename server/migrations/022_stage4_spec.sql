-- Stage 4 rewrite to the client specification "Input / Output Stage 4, 5, 6" (steps 17–20).
-- A contract set can now hold several documents (MSA, DPA, SLA, schedules …). Each document has its own number
-- (DOC-001, DOC-002 …) and versions. Every analysis of the set is saved as a new, locked version, including the
-- versions made by a reviewer's corrections (the extraction history). Older analyses keep their rule pack.

-- Step 17: the 11 input fields. Rows saved before this change are document 1 of their assessment.
ALTER TABLE contract_documents DROP CONSTRAINT contract_documents_assessment_id_version_key;
ALTER TABLE contract_documents
  ADD COLUMN document_no        integer NOT NULL DEFAULT 1,
  ADD COLUMN document_type      text CHECK (document_type IN ('MSA', 'SOW', 'SLA', 'DPA', 'NDA', 'SCC', 'OTHER')),
  ADD COLUMN title              text,
  ADD COLUMN buyer_entity_id    uuid REFERENCES organisations(id),
  ADD COLUMN governing_law      text,
  ADD COLUMN effective_on       date,
  ADD COLUMN expires_on         date,
  ADD COLUMN expiry_explanation text,
  ADD COLUMN execution_status   text CHECK (execution_status IN ('DRAFT', 'SIGNED', 'EXPIRED', 'TERMINATED')),
  ADD COLUMN language           text,
  -- Step 19: the extraction of this file.
  ADD COLUMN extraction_status  text,           -- EXTRACTED, UNREADABLE, LANGUAGE (manual review)
  ADD COLUMN extraction_note    text,
  ADD COLUMN extraction_job_id  uuid,
  ADD COLUMN text_storage_key   text,           -- extracted text, encrypted like the file
  ADD COLUMN text_sha256        text,
  ADD COLUMN extraction         jsonb;          -- this document's clause register and checks, as first extracted
CREATE UNIQUE INDEX contract_documents_doc_version ON contract_documents (assessment_id, document_no, version);

-- Steps 18–20: each analysis of the contract set.
ALTER TABLE contract_analyses DROP CONSTRAINT contract_analyses_contract_id_key;
ALTER TABLE contract_analyses
  ADD COLUMN version                  integer,
  ADD COLUMN status                   text,     -- ANALYSED or HUMAN_REVIEW (extraction not good enough)
  ADD COLUMN trigger                  text,     -- upload or review
  ADD COLUMN document_ids             jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN findings                 jsonb,
  ADD COLUMN preliminary              jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN quality                  jsonb,
  ADD COLUMN corrections              jsonb NOT NULL DEFAULT '[]'::jsonb,  -- reviewer corrections, attributed
  ADD COLUMN extraction_job_id        uuid,
  ADD COLUMN extraction_model_version text,
  ADD COLUMN created_by               uuid REFERENCES users(id);

-- Earlier analyses: one document per assessment, so the analysis version is the document version.
ALTER TABLE contract_analyses DISABLE TRIGGER contract_analyses_no_update;
UPDATE contract_analyses ca SET version = d.version, status = 'ANALYSED', trigger = 'upload', document_ids = jsonb_build_array(d.id)
  FROM contract_documents d WHERE d.id = ca.contract_id;
ALTER TABLE contract_analyses ENABLE TRIGGER contract_analyses_no_update;
ALTER TABLE contract_analyses ALTER COLUMN version SET NOT NULL;
CREATE UNIQUE INDEX contract_analyses_version ON contract_analyses (assessment_id, version);
