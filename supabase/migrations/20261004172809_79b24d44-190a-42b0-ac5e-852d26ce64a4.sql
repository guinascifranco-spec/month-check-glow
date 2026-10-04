-- Preserve the origin of each restored checklist row so rerunning this recovery cannot duplicate it.
ALTER TABLE public.checklist_items ADD COLUMN IF NOT EXISTS source_month_check_row_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS checklist_items_source_month_row_unique
  ON public.checklist_items (user_id, source_month_check_row_id)
  WHERE source_month_check_row_id IS NOT NULL;

-- The backup's 133 legacy rows were checked by ID and content against the current database.
-- Only untouched, zero-value template rows are reused; any user-edited checklist row is retained.
WITH source AS (
  SELECT id, user_id, year, month, descricao, tipo, valor, position, quitado,
         expense_class, category_id
  FROM public.month_check_rows
  WHERE user_id = '09a95c4e-a7a0-4415-8c52-eccdf78ba4c7'::uuid
    AND year = 2026 AND month BETWEEN 3 AND 12
    AND transaction_date IS NULL
), reusable AS (
  SELECT c.id AS checklist_id, s.id AS source_id, s.descricao, s.valor,
         s.quitado, s.expense_class, s.category_id
  FROM source s
  JOIN public.checklist_items c
    ON c.user_id = s.user_id AND c.year = s.year AND c.month = s.month
   AND c.position = s.position AND c.tipo = s.tipo
  WHERE c.source_month_check_row_id IS NULL
    AND c.valor = 0 AND c.quitado = false AND c.created_at = c.updated_at
    AND c.year = 2026 AND c.month BETWEEN 3 AND 12
)
UPDATE public.checklist_items c
SET descricao = r.descricao, valor = r.valor, quitado = r.quitado,
    expense_class = r.expense_class, category_id = r.category_id,
    source_month_check_row_id = r.source_id
FROM reusable r
WHERE c.id = r.checklist_id;

-- Insert historical lines for months without a checklist and extra custom lines;
-- leave any unmatched current row at the same position untouched rather than overwriting it.
INSERT INTO public.checklist_items
  (user_id, year, month, descricao, tipo, valor, quitado, expense_class,
   position, category_id, source_month_check_row_id)
SELECT s.user_id, s.year, s.month, s.descricao, s.tipo, s.valor, s.quitado,
       s.expense_class, s.position, s.category_id, s.id
FROM public.month_check_rows s
WHERE s.user_id = '09a95c4e-a7a0-4415-8c52-eccdf78ba4c7'::uuid
  AND s.year = 2026 AND s.month BETWEEN 3 AND 12
  AND s.transaction_date IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.checklist_items c
    WHERE c.user_id = s.user_id AND c.source_month_check_row_id = s.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.checklist_items c
    WHERE c.user_id = s.user_id AND c.year = s.year AND c.month = s.month
      AND c.position = s.position AND c.tipo = s.tipo
  )
ON CONFLICT DO NOTHING;