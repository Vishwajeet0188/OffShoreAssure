-- Stage 2 rewrite (client spec "Stage 2 Inputs and Outputs", v2): three ways for a buyer to provide a vendor.
--   DIRECTORY_SEARCH  search OffshoreAssure's directory of self-registered, verified vendors (Route A)
--   ADD_NEW_VENDOR    the buyer adds its own vendor; the vendor does not need to be on OffshoreAssure (Route B)
--   EXISTING_VENDOR   reuse a vendor the buyer's organisation has added or selected before (Route C)
-- The routes meet again at step 8 (confirm) and step 9 (save the selection record).

-- 1. Where a vendor company came from. A buyer-provided vendor belongs to the buyer that added it and starts UNVERIFIED.
ALTER TABLE organisations
  ADD COLUMN source text NOT NULL DEFAULT 'self_registered' CHECK (source IN ('self_registered', 'buyer_provided')),
  ADD COLUMN owner_buyer_id uuid REFERENCES organisations(id),
  ADD COLUMN contact_email text,
  ADD COLUMN profile_version integer NOT NULL DEFAULT 1;

ALTER TABLE organisations DROP CONSTRAINT IF EXISTS organisations_verification_status_check;
ALTER TABLE organisations ADD CONSTRAINT organisations_verification_status_check
  CHECK (verification_status IN ('unverified', 'pending', 'approved', 'rejected'));

-- Company names stay unique among self-registered companies. Two buyers may each add a vendor with the same name.
DROP INDEX organisations_kind_name_unique;
CREATE UNIQUE INDEX organisations_kind_name_unique ON organisations (kind, lower(name)) WHERE source = 'self_registered';
CREATE UNIQUE INDEX organisations_buyer_vendor_name ON organisations (owner_buyer_id, lower(name)) WHERE source = 'buyer_provided';
CREATE INDEX organisations_contact_email ON organisations (lower(contact_email)) WHERE source = 'buyer_provided';

-- 2. Optional directory details a vendor can add to its company profile (used by the Route A filters).
--    A vendor that leaves one empty is shown as "Not stated", never filtered out as a failure.
ALTER TABLE organisations
  ADD COLUMN delivery_model text CHECK (delivery_model IN ('Remote', 'Onsite', 'Hybrid')),
  ADD COLUMN industries text[] NOT NULL DEFAULT '{}',
  ADD COLUMN staff_count integer CHECK (staff_count >= 0),
  ADD COLUMN founded_year integer CHECK (founded_year BETWEEN 1800 AND 2100),
  ADD COLUMN certifications text[] NOT NULL DEFAULT '{}',
  ADD COLUMN insurance_cover numeric(14,2) CHECK (insurance_cover >= 0),
  ADD COLUMN insurance_currency text,
  ADD COLUMN support_hours text CHECK (support_hours IN ('Business hours', 'Extended hours', '24/7')),
  ADD COLUMN languages text[] NOT NULL DEFAULT '{}',
  ADD COLUMN min_annual_value numeric(14,2) CHECK (min_annual_value >= 0),
  ADD COLUMN value_currency text,
  ADD COLUMN uses_subprocessors text CHECK (uses_subprocessors IN ('Yes', 'No', 'Unknown'));

-- 3. Every version of a vendor profile. Buyer-provided vendors keep their 25 onboarding fields here;
--    self-registered vendors get a version each time they change their company profile. Never changed or deleted.
CREATE TABLE vendor_profile_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id    uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  version      integer NOT NULL,
  profile      jsonb NOT NULL,
  changed_by   uuid REFERENCES users(id),
  changed_at   timestamptz NOT NULL DEFAULT now(),
  change_note  text,
  sha256       text NOT NULL,
  UNIQUE (vendor_id, version)
);
CREATE FUNCTION vendor_profile_versions_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'vendor_profile_versions is append-only: a saved profile version cannot be changed or deleted';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER vendor_profile_versions_no_update BEFORE UPDATE OR DELETE ON vendor_profile_versions
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION vendor_profile_versions_immutable();

-- Documents a buyer attaches when adding its own vendor (existing contract, existing DPA). Encrypted on disk.
CREATE TABLE buyer_vendor_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id    uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  doc_type     text NOT NULL CHECK (doc_type IN ('contract', 'dpa')),
  file_name    text NOT NULL,
  mime_type    text NOT NULL,
  size_bytes   integer NOT NULL,
  sha256       text NOT NULL,
  storage_key  text NOT NULL,
  uploaded_by  uuid NOT NULL REFERENCES users(id),
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);

-- 4. Step 5 directory searches, so the selection record can say which criteria were used.
CREATE TABLE vendor_searches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id  uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  criteria       jsonb NOT NULL,
  results        integer NOT NULL,
  searched_by    uuid NOT NULL REFERENCES users(id),
  searched_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vendor_searches_assessment ON vendor_searches (assessment_id, searched_at DESC);

-- 5. Candidate set: how each candidate got there, and for Route C the scope and reason for reuse.
ALTER TABLE vendor_shortlist DROP CONSTRAINT IF EXISTS vendor_shortlist_source_check;
ALTER TABLE vendor_shortlist ADD CONSTRAINT vendor_shortlist_source_check
  CHECK (source IN ('search', 'invitation', 'buyer_provided', 'existing'));
ALTER TABLE vendor_shortlist ADD COLUMN reuse jsonb;

-- 6. Step 8–9: the 8 confirmation inputs and the 12 stored fields of the Vendor Selection Record.
ALTER TABLE vendor_selections
  ADD COLUMN selection_mode text,
  ADD COLUMN source text CHECK (source IN ('DIRECTORY', 'EXISTING', 'BUYER_PROVIDED')),
  ADD COLUMN status text CHECK (status IN ('SELECTED_PENDING_ASSESSMENT', 'CONDITIONALLY_SELECTED')),
  ADD COLUMN decision text,
  ADD COLUMN approver_id uuid REFERENCES users(id),
  ADD COLUMN exception_reason text,
  ADD COLUMN conditions jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN selection_criteria jsonb,
  ADD COLUMN comparison_sha256 text,
  ADD COLUMN vendor_profile_version integer,
  ADD COLUMN confirmed_at timestamptz;

-- Earlier selections were all directory vendors chosen from search. Filling in the new columns once is the
-- only change ever made to saved selections, so the append-only trigger is paused just for this statement.
ALTER TABLE vendor_selections DISABLE TRIGGER vendor_selections_no_update;
UPDATE vendor_selections SET source = 'DIRECTORY', selection_mode = 'DIRECTORY_SEARCH',
  status = 'SELECTED_PENDING_ASSESSMENT', decision = 'SELECT', approver_id = selected_by, vendor_profile_version = 1, confirmed_at = selected_at;
ALTER TABLE vendor_selections ENABLE TRIGGER vendor_selections_no_update;

ALTER TABLE assessments ADD COLUMN selection_status text;
UPDATE assessments SET selection_status = 'SELECTED_PENDING_ASSESSMENT' WHERE selected_vendor_id IS NOT NULL;

-- Version 1 for every vendor company that already exists.
INSERT INTO vendor_profile_versions (vendor_id, version, profile, change_note, sha256)
SELECT o.id, 1, p.profile, 'Profile at the time Stage 2 routes were introduced', encode(sha256(convert_to(p.profile::text, 'UTF8')), 'hex')
  FROM organisations o
  CROSS JOIN LATERAL (SELECT jsonb_build_object('legalName', o.name, 'registrationNumber', o.registration_number, 'registeredCountry', o.country,
    'website', o.website, 'serviceDescription', o.description, 'services', to_jsonb(o.services), 'deliveryCountries', to_jsonb(o.delivery_countries)) AS profile) p
 WHERE o.kind = 'vendor';
