-- Add matrix_locked flag to evaluation_periods
-- When true, department users cannot add/remove matrix entries
ALTER TABLE public.evaluation_periods
  ADD COLUMN IF NOT EXISTS matrix_locked boolean NOT NULL DEFAULT false;
