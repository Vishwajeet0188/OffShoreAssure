-- Roles: buyer, vendor (= supplier) and admin. Vendor companies hold a reusable profile (Technical Architecture,
-- "End to End User Journey", Offshore vendor lane) and are verified by the OffshoreAssure team (ASS-001) before buyers see them.

ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer', 'vendor', 'admin'));
UPDATE users SET role = 'admin' WHERE is_admin;

ALTER TABLE organisations ADD COLUMN kind text NOT NULL DEFAULT 'buyer' CHECK (kind IN ('buyer', 'vendor'));
DROP INDEX organisations_name_unique;
CREATE UNIQUE INDEX organisations_kind_name_unique ON organisations (kind, lower(name));

-- Vendor company profile (only used when kind = 'vendor').
ALTER TABLE organisations
  ADD COLUMN registration_number text,
  ADD COLUMN country text,
  ADD COLUMN website text,
  ADD COLUMN description text,
  ADD COLUMN services text[] NOT NULL DEFAULT '{}',
  ADD COLUMN delivery_countries text[] NOT NULL DEFAULT '{}',
  ADD COLUMN verification_status text CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN verification_note text,
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN verified_by uuid REFERENCES users(id),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
