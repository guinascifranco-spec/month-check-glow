CREATE TABLE public.financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  account_type text NOT NULL CHECK (account_type IN ('bank_account', 'wallet', 'other')),
  currency_code text NOT NULL DEFAULT 'BRL' CHECK (currency_code ~ '^[A-Z]{3}$'),
  opening_balance numeric(14, 2),
  opening_balance_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_accounts_opening_pair CHECK (
    (opening_balance IS NULL AND opening_balance_date IS NULL)
    OR (opening_balance IS NOT NULL AND opening_balance_date IS NOT NULL)
  )
);

CREATE INDEX financial_accounts_user_active_idx
  ON public.financial_accounts(user_id, is_active, created_at);

ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.financial_accounts TO authenticated;
GRANT ALL ON public.financial_accounts TO service_role;

CREATE POLICY "Users select own financial accounts"
  ON public.financial_accounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own financial accounts"
  ON public.financial_accounts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own financial accounts"
  ON public.financial_accounts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- No DELETE policy or grant: accounts are deactivated to preserve history.
