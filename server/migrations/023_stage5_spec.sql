-- Stage 5 rewrite to the client specification "Input / Output Stage 4, 5, 6" (steps 21–24).
--
-- Every register version stays locked (the trigger from 012 still applies).
--  * A new contract analysis (Stage 4) gives the next major version: v1.0, v2.0 …
--  * A reviewer's edit gives the next minor version: v1.1, v1.2 …
--    The edit is attributed and the obligation keeps its original contractual source.
-- Registers saved before this change keep their rule pack (RP-2026.10-S5-draft) and are shown as before.

ALTER TABLE obligation_registers
  ADD COLUMN label        text,                               -- "1.0", "1.1", "2.0"
  ADD COLUMN trigger      text,                               -- extract (new contract analysis) or review (reviewer edit)
  ADD COLUMN mappings     jsonb NOT NULL DEFAULT '[]'::jsonb, -- step 22: the 8 mapping fields per obligation and rule
  ADD COLUMN checks       jsonb NOT NULL DEFAULT '[]'::jsonb, -- step 22: basis, party, completeness, conflicts, downstream, evidence
  ADD COLUMN monitors     jsonb NOT NULL DEFAULT '[]'::jsonb, -- step 24: monitoring triggers
  ADD COLUMN records      jsonb NOT NULL DEFAULT '[]'::jsonb, -- step 24: the 10 stored fields per obligation
  ADD COLUMN edits        jsonb NOT NULL DEFAULT '[]'::jsonb, -- every reviewer edit in force in this version
  ADD COLUMN edit         jsonb;                              -- the edit that made this version (null for an extraction)

-- Earlier registers: one version per contract version.
ALTER TABLE obligation_registers DISABLE TRIGGER obligation_registers_no_update;
UPDATE obligation_registers SET label = version || '.0', trigger = 'extract';
ALTER TABLE obligation_registers ENABLE TRIGGER obligation_registers_no_update;
