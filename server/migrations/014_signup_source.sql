-- Where a new account came from: the UTM tags (utm_source, utm_medium, utm_campaign,
-- utm_term, utm_content) on the link the person first opened, and that page.
-- Saved once at sign-up; shown to admins on the user's page.
ALTER TABLE users ADD COLUMN signup_source jsonb;
