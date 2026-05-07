-- Add display_order to departments for hierarchical matrix ordering
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text        NOT NULL,
  -- null = broadcast to all (super_admin + leadership); set to a dept id for dept-specific
  recipient_dept_id uuid    REFERENCES departments(id) ON DELETE CASCADE,
  data          jsonb       NOT NULL DEFAULT '{}',
  is_read       boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications (recipient_dept_id);
CREATE INDEX IF NOT EXISTS notifications_created_idx   ON notifications (created_at DESC);

-- Create evaluation_reports table (dept reports a problem with being chosen)
CREATE TABLE IF NOT EXISTS evaluation_reports (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id  uuid        NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  reporter_dept_id uuid        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  reason           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
