-- ApparelFlow cutting gate schema.
--
-- The application enforces every rule below in its service layer as well. The
-- constraints here are the second line: if a bug or a hand-written SQL statement
-- ever tries to store something the factory process forbids, the database refuses.

CREATE TYPE user_role AS ENUM ('cutting_supervisor', 'cutting_verifier', 'sewing_supervisor');

CREATE TYPE order_status AS ENUM (
  'CUTTING_IN_PROGRESS',
  'PENDING_VERIFICATION',
  'REJECTED',
  'VERIFIED',
  'IN_SEWING'
);

CREATE TYPE verification_decision AS ENUM ('APPROVED', 'REJECTED');

CREATE TABLE users (
  id            serial PRIMARY KEY,
  email         text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  role          user_role NOT NULL,
  full_name     text NOT NULL CHECK (length(trim(full_name)) > 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recipes (
  id               serial PRIMARY KEY,
  recipe_code      text NOT NULL UNIQUE,
  name             text NOT NULL,
  category         text NOT NULL,
  -- Yards of fabric one finished garment should consume.
  std_fabric_yards numeric(6, 2) NOT NULL CHECK (std_fabric_yards > 0),
  -- Highest acceptable fabric overuse, as a percentage of the standard.
  wastage_cap      numeric(5, 2) NOT NULL CHECK (wastage_cap >= 0),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recipe_components (
  id                 serial PRIMARY KEY,
  recipe_id          integer NOT NULL REFERENCES recipes (id) ON DELETE RESTRICT,
  component_name     text NOT NULL,
  pieces_per_garment integer NOT NULL CHECK (pieces_per_garment > 0),
  image_url          text,
  sort_order         integer NOT NULL DEFAULT 0,
  UNIQUE (recipe_id, component_name)
);

CREATE SEQUENCE cutting_order_no_seq START 1001;

CREATE TABLE cutting_orders (
  id                serial PRIMARY KEY,
  order_no          text NOT NULL UNIQUE
                      DEFAULT ('CO-' || lpad(nextval('cutting_order_no_seq')::text, 5, '0')),
  recipe_id         integer NOT NULL REFERENCES recipes (id) ON DELETE RESTRICT,
  target_qty        integer NOT NULL CHECK (target_qty > 0 AND target_qty <= 10000),
  fabric_roll_id    text NOT NULL CHECK (fabric_roll_id ~ '^[A-Z0-9][A-Z0-9-]{2,39}$'),
  -- Unknown while the batch is still being cut; required before it can leave the table.
  actual_fabric_yds numeric(8, 2) CHECK (actual_fabric_yds > 0),
  status            order_status NOT NULL DEFAULT 'CUTTING_IN_PROGRESS',
  created_by        integer NOT NULL REFERENCES users (id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  submitted_at      timestamptz,
  verified_at       timestamptz,
  sewing_started_at timestamptz,
  CHECK (status = 'CUTTING_IN_PROGRESS' OR actual_fabric_yds IS NOT NULL),
  CHECK (status NOT IN ('VERIFIED', 'IN_SEWING') OR verified_at IS NOT NULL),
  CHECK (status <> 'IN_SEWING' OR sewing_started_at IS NOT NULL)
);

CREATE INDEX cutting_orders_status_idx ON cutting_orders (status, submitted_at);

CREATE TABLE verification_items (
  id           serial PRIMARY KEY,
  order_id     integer NOT NULL REFERENCES cutting_orders (id) ON DELETE RESTRICT,
  component_id integer NOT NULL REFERENCES recipe_components (id) ON DELETE RESTRICT,
  expected_qty integer NOT NULL CHECK (expected_qty > 0),
  -- NULL means the verifier has not counted this component yet.
  actual_qty   integer CHECK (actual_qty >= 0 AND actual_qty <= 1000000),
  -- The traffic-light flag is derived by the database from the two counts, so a
  -- stored flag can never disagree with the numbers it describes.
  status       text GENERATED ALWAYS AS (
                 CASE
                   WHEN actual_qty IS NULL THEN 'UNCOUNTED'
                   WHEN actual_qty = expected_qty THEN 'GREEN'
                   WHEN actual_qty > expected_qty THEN 'YELLOW'
                   ELSE 'RED'
                 END
               ) STORED,
  counted_at   timestamptz,
  UNIQUE (order_id, component_id)
);

CREATE TABLE verification_logs (
  id             serial PRIMARY KEY,
  order_id       integer NOT NULL REFERENCES cutting_orders (id) ON DELETE RESTRICT,
  verifier_id    integer NOT NULL REFERENCES users (id),
  decision       verification_decision NOT NULL,
  rejection_note text,
  wastage_pct    numeric(7, 2) NOT NULL,
  -- Expected count, actual count, flag and variance for every component, frozen
  -- at the moment of the decision. Later recounts never change this row.
  items          jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (decision = 'APPROVED' AND rejection_note IS NULL)
    OR (decision = 'REJECTED' AND length(trim(rejection_note)) >= 10)
  )
);

CREATE INDEX verification_logs_order_idx ON verification_logs (order_id, created_at);

-- Every status change and who caused it, for the per-order timeline.
CREATE TABLE order_events (
  id          serial PRIMARY KEY,
  order_id    integer NOT NULL REFERENCES cutting_orders (id) ON DELETE RESTRICT,
  actor_id    integer NOT NULL REFERENCES users (id),
  event_type  text NOT NULL CHECK (event_type IN ('CREATED', 'SUBMITTED', 'RESUBMITTED', 'APPROVED', 'REJECTED', 'SEWING_STARTED')),
  from_status order_status,
  to_status   order_status NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_events_order_idx ON order_events (order_id, created_at);

-- Audit rows are written once. Updates and deletes are refused outright, even
-- for the application's own database user, so a compromised or buggy route
-- cannot rewrite who signed off a batch.
CREATE FUNCTION refuse_audit_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER verification_logs_append_only
  BEFORE UPDATE OR DELETE ON verification_logs
  FOR EACH ROW EXECUTE FUNCTION refuse_audit_change();

CREATE TRIGGER verification_logs_no_truncate
  BEFORE TRUNCATE ON verification_logs
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_audit_change();

CREATE TRIGGER order_events_append_only
  BEFORE UPDATE OR DELETE ON order_events
  FOR EACH ROW EXECUTE FUNCTION refuse_audit_change();

CREATE TRIGGER order_events_no_truncate
  BEFORE TRUNCATE ON order_events
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_audit_change();
