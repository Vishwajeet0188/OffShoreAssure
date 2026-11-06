-- Stage 1, Step 1: buyer submits an outsourcing requirement (32 fields), saved as draft until submitted.
-- Steps 2-4 (Assessment ID, derived fields, versioned profile) build on these tables.

CREATE TABLE requirements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by     uuid NOT NULL REFERENCES users(id),
  -- draft:     buyer is still filling it in (any fields may be missing)
  -- submitted: all mandatory and conditional fields passed validation (Step 1 "accepted")
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  data           jsonb NOT NULL DEFAULT '{}'::jsonb,
  title          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  submitted_at   timestamptz
);
CREATE INDEX requirements_owner ON requirements (created_by, updated_at DESC);

-- Supporting documents (all optional). Files are stored outside the database; the SHA-256 hash proves integrity.
CREATE TABLE requirement_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id  uuid NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  doc_type        text NOT NULL,
  file_name       text NOT NULL,
  mime_type       text NOT NULL,
  size_bytes      integer NOT NULL,
  sha256          text NOT NULL,
  storage_key     text NOT NULL,
  uploaded_by     uuid NOT NULL REFERENCES users(id),
  uploaded_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX requirement_documents_req ON requirement_documents (requirement_id);
