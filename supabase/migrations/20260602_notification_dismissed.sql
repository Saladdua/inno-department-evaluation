ALTER TABLE notification_reads
  ADD COLUMN IF NOT EXISTS dismissed boolean DEFAULT false NOT NULL;
