-- Public website: feedback and questions sent from the home page. Read by the OffshoreAssure team in the admin console.
CREATE TABLE feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('feedback', 'question', 'problem', 'idea')),
  rating      integer CHECK (rating BETWEEN 1 AND 5),
  message     text NOT NULL,
  name        text,
  email       text,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  page        text,
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feedback_created ON feedback (created_at DESC);
