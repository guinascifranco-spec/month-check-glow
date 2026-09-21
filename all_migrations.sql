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

CREATE TABLE public.investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL DEFAULT '',
  balance numeric NOT NULL DEFAULT 0,
  monthly_return_pct numeric NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.investments TO authenticated;
GRANT ALL ON public.investments TO service_role;

ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own investments" ON public.investments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own investments" ON public.investments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own investments" ON public.investments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own investments" ON public.investments FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_investments_updated_at
BEFORE UPDATE ON public.investments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


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



-- Enums
DO $$ BEGIN
  CREATE TYPE public.asset_type AS ENUM ('acao','fii','renda_fixa','cripto');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.provento_type AS ENUM ('dividendo','jcp','rendimento','cupom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.provento_status AS ENUM ('a_reinvestir','reinvestido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ativos
CREATE TABLE public.ativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo public.asset_type NOT NULL,
  nome text NOT NULL,
  corretora text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ativos TO authenticated;
GRANT ALL ON public.ativos TO service_role;
ALTER TABLE public.ativos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own ativos" ON public.ativos FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own ativos" ON public.ativos FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own ativos" ON public.ativos FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own ativos" ON public.ativos FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_ativos_updated_at BEFORE UPDATE ON public.ativos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- aportes
CREATE TABLE public.aportes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ativo_id uuid NOT NULL REFERENCES public.ativos(id) ON DELETE CASCADE,
  data date NOT NULL,
  quantidade numeric NOT NULL DEFAULT 0,
  valor_unitario numeric NOT NULL DEFAULT 0,
  valor_total numeric NOT NULL DEFAULT 0,
  taxas numeric NOT NULL DEFAULT 0,
  is_retroativo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aportes TO authenticated;
GRANT ALL ON public.aportes TO service_role;
ALTER TABLE public.aportes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own aportes" ON public.aportes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own aportes" ON public.aportes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own aportes" ON public.aportes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own aportes" ON public.aportes FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_aportes_user_data ON public.aportes(user_id, data);
CREATE INDEX idx_aportes_ativo ON public.aportes(ativo_id);
CREATE TRIGGER trg_aportes_updated_at BEFORE UPDATE ON public.aportes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- proventos
CREATE TABLE public.proventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ativo_id uuid NOT NULL REFERENCES public.ativos(id) ON DELETE CASCADE,
  tipo public.provento_type NOT NULL,
  data_recebimento date NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  status public.provento_status NOT NULL DEFAULT 'a_reinvestir',
  aporte_reinvestimento_id uuid REFERENCES public.aportes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proventos TO authenticated;
GRANT ALL ON public.proventos TO service_role;
ALTER TABLE public.proventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own proventos" ON public.proventos FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own proventos" ON public.proventos FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own proventos" ON public.proventos FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own proventos" ON public.proventos FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_proventos_user_data ON public.proventos(user_id, data_recebimento);
CREATE INDEX idx_proventos_ativo ON public.proventos(ativo_id);
CREATE TRIGGER trg_proventos_updated_at BEFORE UPDATE ON public.proventos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


DROP POLICY "Users select own rows" ON public.month_check_rows;
DROP POLICY "Users insert own rows" ON public.month_check_rows;
DROP POLICY "Users update own rows" ON public.month_check_rows;
DROP POLICY "Users delete own rows" ON public.month_check_rows;

CREATE POLICY "Users select own rows" ON public.month_check_rows FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own rows" ON public.month_check_rows FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own rows" ON public.month_check_rows FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own rows" ON public.month_check_rows FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.month_check_rows ADD COLUMN IF NOT EXISTS quitado boolean NOT NULL DEFAULT false;

ALTER TABLE public.month_check_rows
ADD COLUMN expense_class text NOT NULL DEFAULT 'variavel';

ALTER TABLE public.month_check_rows
ADD CONSTRAINT month_check_rows_expense_class_check
CHECK (expense_class IN ('fixo', 'variavel'));

UPDATE public.month_check_rows
SET expense_class = 'fixo'
WHERE tipo = 'saida'
  AND lower(trim(descricao)) IN (
    'aluguel',
    'condomínio',
    'condominio',
    'energia',
    'internet e celular',
    'água',
    'agua',
    'gás',
    'gas',
    'lavanderia',
    'psicólogo',
    'psicologo'
  );

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


-- Fase 1-C: installments.kind
-- Adiciona coluna kind para distinguir parcelamentos de assinaturas.
-- DEFAULT 'parcelamento' garante que todos os registros existentes permanecem inalterados.

ALTER TABLE public.installments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'parcelamento'
  CHECK (kind IN ('parcelamento', 'assinatura'));


-- Fase 1-D: ativos — saldo_atual e rentabilidade_mensal_pct
-- Necessário para que a projeção use ativos como fonte de dados de investimentos,
-- substituindo a tabela simples `investments`.

ALTER TABLE public.ativos
  ADD COLUMN IF NOT EXISTS saldo_atual numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rentabilidade_mensal_pct numeric NOT NULL DEFAULT 0;
