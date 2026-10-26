-- Automatic checks (Technical Architecture, element F; Stage 9 "rescores continuously").
-- Once a day OffshoreAssure re-checks every assessment: an expired certificate or insurance
-- re-scores the compliance result, rebuilds the risk register, and renewals are requested
-- from the vendor 30 days before expiry. Records made by these checks have no person
-- behind them, so created_by is empty and the screens show "OffshoreAssure (automatic)".

ALTER TABLE compliance_results ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE risk_registers     ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE monitoring_checks  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE monitoring_checks DROP CONSTRAINT monitoring_checks_choice_check;
ALTER TABLE monitoring_checks ADD CONSTRAINT monitoring_checks_choice_check CHECK (choice IN ('monitor', 'check', 'auto'));

-- One row per run of the automatic checks, so the admin can see when they last ran and what they did.
CREATE TABLE automatic_check_runs (
  id           bigserial PRIMARY KEY,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  trigger      text NOT NULL CHECK (trigger IN ('schedule', 'admin')),
  summary      jsonb NOT NULL DEFAULT '{}'
);
