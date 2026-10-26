-- Support tickets: anyone (a buyer, a vendor or a visitor) can raise a query from the Contact page
-- and gets a ticket number. The OffshoreAssure team answers in the admin console with remarks and
-- changes the status. The person who raised it sees the remarks under the ticket on the Contact page.

CREATE SEQUENCE support_ticket_seq;

CREATE TABLE support_tickets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number        text NOT NULL UNIQUE,                     -- OA-TKT-2026-000001
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  role          text NOT NULL CHECK (role IN ('buyer', 'vendor', 'admin', 'visitor')),
  name          text NOT NULL,
  email         text NOT NULL,
  phone         text,
  organisation  text,
  category      text NOT NULL,
  reference     text,                                     -- an Assessment ID, if the query is about one
  subject       text NOT NULL,
  message       text NOT NULL,
  status        text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'CLOSED')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  closed_at     timestamptz
);
CREATE INDEX support_tickets_user ON support_tickets (user_id, created_at DESC);
CREATE INDEX support_tickets_status ON support_tickets (status, created_at DESC);
CREATE INDEX support_tickets_email ON support_tickets (lower(email));

-- Remarks from the OffshoreAssure team and status changes. Never changed or deleted.
CREATE TABLE support_ticket_events (
  id           bigserial PRIMARY KEY,
  ticket_id    uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  at           timestamptz NOT NULL DEFAULT now(),
  author_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  remark       text,
  from_status  text,
  to_status    text
);
CREATE INDEX support_ticket_events_ticket ON support_ticket_events (ticket_id, id);

CREATE FUNCTION support_ticket_events_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'support_ticket_events is append-only: a remark cannot be changed or deleted';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER support_ticket_events_no_update BEFORE UPDATE OR DELETE ON support_ticket_events
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION support_ticket_events_immutable();
