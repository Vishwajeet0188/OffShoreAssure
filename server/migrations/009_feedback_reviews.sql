-- Public reviews on the home page: shown only when the sender agreed AND an admin published it.
ALTER TABLE feedback
  ADD COLUMN public_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN published boolean NOT NULL DEFAULT false,
  ADD COLUMN published_at timestamptz,
  ADD COLUMN published_by uuid REFERENCES users(id);
ALTER TABLE feedback ADD CONSTRAINT feedback_publish_needs_consent CHECK (NOT published OR public_consent);
CREATE INDEX feedback_published ON feedback (published_at DESC) WHERE published;
