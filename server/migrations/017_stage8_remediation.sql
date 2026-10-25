-- Stage 8, Remediation (sequence diagram steps 33–38).
-- Step 33: each risk from the Stage 7 register becomes a proposed action; the buyer approves, assigns or accepts the risk.
-- Step 34: actions for the vendor are sent to it.   Step 35: the vendor submits evidence and a response.
-- Step 36: the buyer reviews it; the engine works out the remaining risk.   Step 37: every change is kept.
-- Step 38: the buyer sees the updated status and what is still outstanding.

CREATE TABLE remediation_actions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id          uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  number                 integer NOT NULL,                 -- ACT-01, ACT-02 … per assessment
  register_version       integer NOT NULL,                 -- the Stage 7 register it came from
  risk_id                text NOT NULL,                    -- RSK-xx in that register
  theme                  text NOT NULL,
  title                  text NOT NULL,
  owner                  text NOT NULL CHECK (owner IN ('vendor', 'buyer')),
  requests               jsonb NOT NULL,                   -- what is needed, in plain words
  needs_document         boolean NOT NULL DEFAULT false,
  source_stages          jsonb NOT NULL,
  rating                 text NOT NULL,
  score                  integer NOT NULL,
  status                 text NOT NULL DEFAULT 'PROPOSED'
                           CHECK (status IN ('PROPOSED', 'OPEN', 'RETURNED', 'SUBMITTED', 'CLOSED', 'RISK_ACCEPTED')),
  due_on                 date,
  suggested_due_on       date NOT NULL,
  buyer_note             text,                             -- the buyer's instruction, return reason or acceptance reason
  response               text,                             -- the latest response from whoever acted
  submitted_at           timestamptz,
  closed_at              timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, number)
);
CREATE INDEX remediation_actions_assessment ON remediation_actions (assessment_id);

-- Step 37: every change to an action. Never changed or deleted.
CREATE TABLE remediation_events (
  id          bigserial PRIMARY KEY,
  action_id   uuid NOT NULL REFERENCES remediation_actions(id) ON DELETE CASCADE,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid REFERENCES users(id),
  actor_role  text NOT NULL,
  event       text NOT NULL,
  detail      jsonb NOT NULL DEFAULT '{}'
);
CREATE TRIGGER remediation_events_no_update BEFORE UPDATE OR DELETE ON remediation_events
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION contract_records_immutable();

-- Step 35: documents sent as proof (encrypted on disk). Removable only until the response is submitted.
CREATE TABLE remediation_evidence (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id    uuid NOT NULL REFERENCES remediation_actions(id) ON DELETE CASCADE,
  file_name    text NOT NULL,
  mime_type    text NOT NULL,
  size_bytes   integer NOT NULL,
  sha256       text NOT NULL,
  storage_key  text NOT NULL,
  uploaded_by  uuid NOT NULL REFERENCES users(id),
  uploaded_at  timestamptz NOT NULL DEFAULT now(),
  submitted    boolean NOT NULL DEFAULT false
);

-- Step 36–37: the remaining risk after each closed action or accepted risk. Never changed or deleted.
CREATE TABLE remediation_snapshots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id      uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  version            integer NOT NULL,
  register_version   integer NOT NULL,
  reason             text NOT NULL,
  rule_pack_version  text NOT NULL,
  residual           jsonb NOT NULL,
  actions            jsonb NOT NULL,                       -- each action's status at that moment
  snapshot_sha256    text NOT NULL,
  created_by         uuid NOT NULL REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, version)
);
CREATE TRIGGER remediation_snapshots_no_update BEFORE UPDATE OR DELETE ON remediation_snapshots
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION contract_records_immutable();
