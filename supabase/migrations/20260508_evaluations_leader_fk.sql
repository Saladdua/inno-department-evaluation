-- Leadership users evaluate using their user UUID as evaluator_id (not a dept ID).
-- The FK to departments(id) blocks their saves, so drop it.
-- The onConflict unique index (period_id, evaluator_id, target_id) is preserved.
ALTER TABLE public.evaluations
  DROP CONSTRAINT IF EXISTS evaluations_evaluator_id_fkey;
