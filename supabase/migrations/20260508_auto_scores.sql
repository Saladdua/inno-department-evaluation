-- Auto evaluation scores stored globally per department (independent of manual evaluators)
-- Written by data processing (Xử lí dữ liệu), not by manual evaluators.
CREATE TABLE IF NOT EXISTS public.auto_scores (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id   uuid        NOT NULL REFERENCES public.evaluation_periods(id) ON DELETE CASCADE,
  dept_id     uuid        NOT NULL REFERENCES public.departments(id)         ON DELETE CASCADE,
  criteria_id uuid        NOT NULL REFERENCES public.criteria(id)            ON DELETE CASCADE,
  source      text        NOT NULL, 
  raw_score   numeric(5,2) NOT NULL DEFAULT 0,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (period_id, dept_id, criteria_id)
);

CREATE INDEX IF NOT EXISTS idx_auto_scores_period_dept ON public.auto_scores(period_id, dept_id);
