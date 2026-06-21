
-- installment_settings: per-user monthly limit
CREATE TABLE public.installment_settings (
  user_id uuid PRIMARY KEY,
  monthly_limit numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.installment_settings TO authenticated;
GRANT ALL ON public.installment_settings TO service_role;
ALTER TABLE public.installment_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own settings" ON public.installment_settings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own settings" ON public.installment_settings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own settings" ON public.installment_settings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own settings" ON public.installment_settings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER update_installment_settings_updated_at
  BEFORE UPDATE ON public.installment_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- installments: each purchase
CREATE TABLE public.installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  first_date date NOT NULL,
  installment_value numeric NOT NULL DEFAULT 0,
  total_installments integer NOT NULL DEFAULT 1,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.installments TO authenticated;
GRANT ALL ON public.installments TO service_role;
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own installments" ON public.installments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own installments" ON public.installments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own installments" ON public.installments
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own installments" ON public.installments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER update_installments_updated_at
  BEFORE UPDATE ON public.installments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
