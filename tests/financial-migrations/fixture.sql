-- Synthetic audited dependencies only; never load a production dump.
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE TABLE public.expense_categories (id uuid PRIMARY KEY, user_id uuid NOT NULL, name text NOT NULL);
CREATE TABLE public.month_check_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  year integer NOT NULL, month integer NOT NULL, descricao text NOT NULL DEFAULT '',
  tipo text NOT NULL CHECK(tipo IN ('entrada','saida')), valor numeric NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0, transaction_date date, category_id uuid,
  expense_class text NOT NULL DEFAULT 'variavel', quitado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  invoice_card text, invoice_line integer, invoice_source text,
  invoice_installment_current integer, invoice_installment_total integer
);
CREATE TYPE public.provento_status AS ENUM ('a_reinvestir','reinvestido');
CREATE TABLE public.ativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, nome text,
  saldo_atual numeric NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.aportes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  ativo_id uuid NOT NULL REFERENCES public.ativos(id) ON DELETE CASCADE, data date NOT NULL,
  quantidade numeric NOT NULL DEFAULT 0, valor_unitario numeric NOT NULL DEFAULT 0,
  valor_total numeric NOT NULL DEFAULT 0, taxas numeric NOT NULL DEFAULT 0,
  is_retroativo boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.proventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  ativo_id uuid NOT NULL REFERENCES public.ativos(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'dividendo', data_recebimento date NOT NULL, valor numeric NOT NULL,
  status public.provento_status NOT NULL DEFAULT 'a_reinvestir',
  aporte_reinvestimento_id uuid REFERENCES public.aportes(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Retain owner-scoped legacy permissions in the fixture.
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ativos, public.aportes, public.proventos,
  public.month_check_rows, public.expense_categories TO authenticated;
ALTER TABLE public.ativos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aportes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.month_check_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner ON public.ativos TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE POLICY owner ON public.aportes TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE POLICY owner ON public.proventos TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE POLICY owner ON public.month_check_rows TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE POLICY owner ON public.expense_categories TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);