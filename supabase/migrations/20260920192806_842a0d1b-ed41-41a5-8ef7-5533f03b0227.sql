CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color_key text NOT NULL DEFAULT 'emerald',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_categories_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT expense_categories_unique_name UNIQUE (user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own expense categories" ON public.expense_categories FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own expense categories" ON public.expense_categories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own expense categories" ON public.expense_categories FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own expense categories" ON public.expense_categories FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_expense_categories_updated_at BEFORE UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.month_check_rows
  ADD COLUMN transaction_date date,
  ADD COLUMN category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL;
CREATE INDEX month_check_rows_user_transaction_date_idx ON public.month_check_rows(user_id, transaction_date);
CREATE INDEX month_check_rows_category_id_idx ON public.month_check_rows(category_id);