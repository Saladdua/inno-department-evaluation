-- Add display_order to departments for hierarchical matrix ordering
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

-- Create notifications table (no is_read — per-user read state lives in notification_reads)
CREATE TABLE IF NOT EXISTS notifications (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type              text        NOT NULL,
  -- null = broadcast to all; set to a dept id for dept-specific
  recipient_dept_id uuid        REFERENCES departments(id) ON DELETE CASCADE,
  data              jsonb       NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- If you already ran a previous version that included is_read, drop it:
ALTER TABLE notifications DROP COLUMN IF EXISTS is_read;

CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications (recipient_dept_id);
CREATE INDEX IF NOT EXISTS notifications_created_idx   ON notifications (created_at DESC);

-- Per-user read state: one row = "this user has read this notification"
CREATE TABLE IF NOT EXISTS notification_reads (
  user_id         uuid NOT NULL,
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, notification_id)
);

CREATE INDEX IF NOT EXISTS notification_reads_user_idx ON notification_reads (user_id);

-- Create evaluation_reports table (dept reports a problem with being chosen)
CREATE TABLE IF NOT EXISTS evaluation_reports (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id  uuid        NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  reporter_dept_id uuid        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  reason           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
