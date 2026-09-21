-- Fase 1-A: checklist_items
-- Tabela exclusiva da aba Conferência, completamente isolada de month_check_rows.
-- Os dados existentes em month_check_rows sem transaction_date serão copiados aqui
-- pelo script de migração de dados (aplicado manualmente no Supabase após aprovação).

CREATE TABLE IF NOT EXISTS public.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  descricao text NOT NULL DEFAULT '',
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  expense_class text NOT NULL DEFAULT 'fixo' CHECK (expense_class IN ('fixo', 'variavel')),
  valor numeric NOT NULL DEFAULT 0,
  quitado boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checklist_items_user_period_idx
  ON public.checklist_items (user_id, year, month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_items TO authenticated;
GRANT ALL ON public.checklist_items TO service_role;

ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own checklist items"
  ON public.checklist_items FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own checklist items"
  ON public.checklist_items FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own checklist items"
  ON public.checklist_items FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own checklist items"
  ON public.checklist_items FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_checklist_items_updated_at
  BEFORE UPDATE ON public.checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
