
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
