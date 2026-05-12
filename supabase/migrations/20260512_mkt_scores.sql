-- MKT INNO scoring table
-- Stores per-dept activity scores entered by the marketing role user.
-- scores: integer array of 13 values (columns B–N in the MKT scoring sheet)
-- member_count: number of people in the dept (column P)
CREATE TABLE IF NOT EXISTS public.mkt_scores (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id    uuid        NOT NULL REFERENCES public.evaluation_periods(id) ON DELETE CASCADE,
  dept_id      uuid        NOT NULL REFERENCES public.departments(id)         ON DELETE CASCADE,
  scores       integer[]   NOT NULL DEFAULT '{0,0,0,0,0,0,0,0,0,0,0,0,0}',
  member_count integer     NOT NULL DEFAULT 1,
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (period_id, dept_id)
);

CREATE INDEX IF NOT EXISTS idx_mkt_scores_period ON public.mkt_scores(period_id);

-- If the users.role column has a CHECK constraint, add 'marketing'.
-- Safe no-op if it's a plain text column.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.users'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%'
  LIMIT 1;

  IF cname IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.users DROP CONSTRAINT %I', cname
    );
    EXECUTE format(
      'ALTER TABLE public.users ADD CONSTRAINT %I CHECK (role IN (''super_admin'',''leadership'',''department'',''marketing''))',
      cname
    );
  END IF;
END $$;
