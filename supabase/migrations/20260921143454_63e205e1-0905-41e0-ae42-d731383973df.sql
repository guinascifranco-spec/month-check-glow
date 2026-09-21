-- Fase 1-B: category_rules
-- Tabela de regras palavra-chave → categoria para sugestão automática em Lançamentos.

CREATE TABLE IF NOT EXISTS public.category_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  keyword text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.expense_categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT category_rules_unique UNIQUE (user_id, keyword)
);

CREATE INDEX IF NOT EXISTS category_rules_user_idx
  ON public.category_rules (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_rules TO authenticated;
GRANT ALL ON public.category_rules TO service_role;

ALTER TABLE public.category_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own category rules"
  ON public.category_rules FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own category rules"
  ON public.category_rules FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own category rules"
  ON public.category_rules FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own category rules"
  ON public.category_rules FOR DELETE TO authenticated
  USING (auth.uid() = user_id);