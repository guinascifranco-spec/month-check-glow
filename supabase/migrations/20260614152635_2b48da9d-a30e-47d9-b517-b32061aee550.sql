CREATE TABLE public.month_check_rows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  descricao TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida')),
  valor NUMERIC NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX month_check_rows_user_period_idx ON public.month_check_rows (user_id, year, month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.month_check_rows TO authenticated;
GRANT ALL ON public.month_check_rows TO service_role;

ALTER TABLE public.month_check_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own rows" ON public.month_check_rows FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own rows" ON public.month_check_rows FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own rows" ON public.month_check_rows FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own rows" ON public.month_check_rows FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_month_check_rows_updated_at
BEFORE UPDATE ON public.month_check_rows
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();