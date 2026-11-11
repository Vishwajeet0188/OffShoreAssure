-- Stage 6 rewrite to the client specification "Input / Output Stage 4, 5, 6" (steps 25–28).
--
-- Routes are now between legal entities (buyer → supplier → teams, sub-processors, cloud hosts).
-- The buyer can confirm facts about a route (the receiving entity, its role, the safeguard, the TRA …).
-- Each set of facts is kept as a version, and every route is saved on its own: a new location,
-- entity or safeguard gives the route a new version (step 28 boundary). Nothing here can be changed later.
-- Assessments saved before this change keep their rule pack (RP-2026.10-S6-draft) and are shown as before.

-- Facts the buyer (or a legal reviewer) confirmed for a route.
CREATE TABLE transfer_route_facts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id  uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  route_key      text NOT NULL,                 -- vendor, access:IN, sub:aws, storage:US …
  version        integer NOT NULL,
  facts          jsonb NOT NULL,                -- all facts in force for the route after this change
  reason         text NOT NULL,
  created_by     uuid NOT NULL REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, route_key, version)
);
CREATE TRIGGER transfer_route_facts_no_update BEFORE UPDATE OR DELETE ON transfer_route_facts
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION contract_records_immutable();

-- Step 28: each route saved independently, with its evidence and rationale (one row per route version).
CREATE TABLE transfer_routes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id     uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  route_key         text NOT NULL,
  route_version     integer NOT NULL,
  register_version  integer NOT NULL,           -- the Transfer Assessment Register version that first saved it
  route_id          text NOT NULL,              -- TR-001 …
  status            text NOT NULL,
  fingerprint       text NOT NULL,
  route             jsonb NOT NULL,             -- the 18 route fields, the 12 decision fields and the 10 output fields
  record            jsonb NOT NULL,             -- the 12 stored fields
  content_sha256    text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, route_key, route_version)
);
CREATE TRIGGER transfer_routes_no_update BEFORE UPDATE OR DELETE ON transfer_routes
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION contract_records_immutable();

ALTER TABLE transfer_assessments
  ADD COLUMN label     text,                                -- "1.0", "2.0" (Transfer Assessment Register v1.0)
  ADD COLUMN flow_map  jsonb NOT NULL DEFAULT '{}'::jsonb;  -- step 25: the visual data-flow map

ALTER TABLE transfer_assessments DISABLE TRIGGER transfer_assessments_no_update;
UPDATE transfer_assessments SET label = version || '.0';
ALTER TABLE transfer_assessments ENABLE TRIGGER transfer_assessments_no_update;
