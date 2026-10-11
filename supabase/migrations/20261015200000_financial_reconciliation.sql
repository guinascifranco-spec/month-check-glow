-- Etapa 3G: conciliações, avaliações de mercado e reversões compensatórias.
-- Esta migração é aditiva e NÃO deve ser aplicada automaticamente ao banco ativo.
ALTER TABLE public.investment_cash_operations
  ADD CONSTRAINT investment_cash_operations_id_user_id_key UNIQUE (id, user_id);

CREATE TABLE public.financial_account_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  account_type text NOT NULL,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  reference_date date NOT NULL,
  reported_balance numeric(14,2) NOT NULL,
  calculated_balance numeric(14,2),
  difference numeric(14,2),
  status text NOT NULL CHECK (status IN ('reconciled', 'divergent', 'inconclusive')),
  note text CHECK (note IS NULL OR length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_account_reconciliations_account_owner_fk
    FOREIGN KEY (account_id, user_id) REFERENCES public.financial_accounts(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT financial_account_reconciliations_result_check CHECK (
    (status = 'inconclusive' AND calculated_balance IS NULL AND difference IS NULL)
    OR (status = 'reconciled' AND calculated_balance IS NOT NULL AND difference = 0)
    OR (status = 'divergent' AND calculated_balance IS NOT NULL AND difference <> 0)
  )
);
CREATE INDEX financial_account_reconciliations_user_account_date_idx
  ON public.financial_account_reconciliations(user_id, account_id, reference_date DESC, created_at DESC);
ALTER TABLE public.financial_account_reconciliations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.financial_account_reconciliations TO authenticated;
GRANT ALL ON public.financial_account_reconciliations TO service_role;
CREATE POLICY "Users select own account reconciliations" ON public.financial_account_reconciliations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.financial_transfer_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transfer_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_transfer_cancellations_transfer_owner_fk FOREIGN KEY (transfer_id, user_id)
    REFERENCES public.financial_transfers(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT financial_transfer_cancellations_transfer_unique UNIQUE (transfer_id)
);
ALTER TABLE public.financial_transfer_cancellations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.financial_transfer_cancellations TO authenticated;
GRANT ALL ON public.financial_transfer_cancellations TO service_role;
CREATE POLICY "Users select own transfer cancellations" ON public.financial_transfer_cancellations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.cancel_financial_transfer_with_reason(p_transfer_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); transfer_row public.financial_transfers%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'A cancellation reason is required';
  END IF;
  SELECT * INTO transfer_row FROM public.financial_transfers
    WHERE id = p_transfer_id AND user_id = uid FOR UPDATE;
  IF NOT FOUND OR transfer_row.status <> 'completed' THEN RAISE EXCEPTION 'Active transfer not found'; END IF;
  UPDATE public.financial_transfers SET status = 'cancelled', updated_at = now()
    WHERE id = p_transfer_id AND user_id = uid;
  INSERT INTO public.financial_transfer_cancellations(user_id, transfer_id, reason)
    VALUES (uid, p_transfer_id, trim(p_reason));
  RETURN p_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_financial_account_reconciliation(
  p_account_id uuid, p_reference_date date, p_reported_balance_text text, p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); reported numeric; calculated numeric; account_kind text; currency text;
  result_status text; result_difference numeric; reconciliation_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_reference_date IS NULL THEN RAISE EXCEPTION 'Reference date is required'; END IF;
  BEGIN reported := trim(p_reported_balance_text)::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid reported balance'; END;
  IF reported <> round(reported, 2) OR abs(reported) >= 1000000000000 THEN
    RAISE EXCEPTION 'Reported balance must have at most two decimal places';
  END IF;
  IF p_note IS NOT NULL AND length(p_note) > 500 THEN RAISE EXCEPTION 'Note is too long'; END IF;
  SELECT a.account_type, a.currency_code INTO account_kind, currency
    FROM public.financial_accounts a WHERE a.id = p_account_id AND a.user_id = uid FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found for this user'; END IF;
  SELECT b.calculated_balance::numeric INTO calculated
    FROM public.financial_account_balances(p_reference_date) b WHERE b.account_id = p_account_id;
  IF calculated IS NULL THEN
    result_status := 'inconclusive'; result_difference := NULL;
  ELSE
    result_difference := round(reported - calculated, 2);
    result_status := CASE WHEN result_difference = 0 THEN 'reconciled' ELSE 'divergent' END;
  END IF;
  INSERT INTO public.financial_account_reconciliations(
    user_id, account_id, account_type, currency_code, reference_date, reported_balance,
    calculated_balance, difference, status, note
  ) VALUES (
    uid, p_account_id, account_kind, currency, p_reference_date, reported,
    calculated, result_difference, result_status, nullif(trim(p_note), '')
  ) RETURNING id INTO reconciliation_id;
  RETURN reconciliation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_financial_account_reconciliations(p_account_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid, account_id uuid, account_name text, account_type text, currency_code text,
  reference_date date, reported_balance text, calculated_balance text, difference text,
  status text, note text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.id, r.account_id, a.name, r.account_type, r.currency_code, r.reference_date,
    r.reported_balance::text, r.calculated_balance::text, r.difference::text,
    r.status, r.note, r.created_at
  FROM public.financial_account_reconciliations r
  JOIN public.financial_accounts a ON a.id = r.account_id AND a.user_id = r.user_id
  WHERE r.user_id = auth.uid() AND (p_account_id IS NULL OR r.account_id = p_account_id)
  ORDER BY r.reference_date DESC, r.created_at DESC
$$;

CREATE TABLE public.investment_valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL,
  market_value numeric(14,2) NOT NULL CHECK (market_value >= 0),
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  reference_date date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin = 'manual'),
  note text CHECK (note IS NULL OR length(note) <= 500),
  CONSTRAINT investment_valuations_asset_owner_fk FOREIGN KEY (asset_id, user_id)
    REFERENCES public.ativos(id, user_id) ON DELETE RESTRICT
);
CREATE INDEX investment_valuations_user_asset_date_idx
  ON public.investment_valuations(user_id, asset_id, reference_date DESC, recorded_at DESC);
ALTER TABLE public.investment_valuations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.investment_valuations TO authenticated;
GRANT ALL ON public.investment_valuations TO service_role;
CREATE POLICY "Users select own investment valuations" ON public.investment_valuations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.record_investment_valuation(
  p_asset_id uuid, p_market_value_text text, p_reference_date date, p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); value_amount numeric; currency text; valuation_id uuid; latest_operation date;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_reference_date IS NULL THEN RAISE EXCEPTION 'Reference date is required'; END IF;
  BEGIN value_amount := trim(p_market_value_text)::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid market value'; END;
  IF value_amount < 0 OR value_amount <> round(value_amount, 2) THEN
    RAISE EXCEPTION 'Market value must be non-negative with at most two decimal places';
  END IF;
  IF p_note IS NOT NULL AND length(p_note) > 500 THEN RAISE EXCEPTION 'Note is too long'; END IF;
  SELECT currency_code INTO currency FROM public.ativos WHERE id = p_asset_id AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset not found for this user'; END IF;
  INSERT INTO public.investment_valuations(user_id, asset_id, market_value, currency_code, reference_date, note)
    VALUES (uid, p_asset_id, value_amount, currency, p_reference_date, nullif(trim(p_note), ''))
    RETURNING id INTO valuation_id;
  SELECT max(effective_date) INTO latest_operation FROM public.investment_cash_operations
    WHERE asset_id = p_asset_id AND user_id = uid;
  -- A avaliação é aplicável à posição atual quando cobre a operação mais recente.
  IF latest_operation IS NULL OR p_reference_date >= latest_operation THEN
    UPDATE public.ativos SET saldo_atual = value_amount, current_value_known = true,
      current_value_date = p_reference_date, updated_at = now()
      WHERE id = p_asset_id AND user_id = uid
        AND (current_value_date IS NULL OR p_reference_date >= current_value_date);
  END IF;
  RETURN valuation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_investment_valuations(p_asset_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid, asset_id uuid, asset_name text, market_value text, currency_code text,
  reference_date date, recorded_at timestamptz, origin text, note text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT v.id, v.asset_id, a.nome, v.market_value::text, v.currency_code,
    v.reference_date, v.recorded_at, v.origin, v.note
  FROM public.investment_valuations v JOIN public.ativos a ON a.id = v.asset_id AND a.user_id = v.user_id
  WHERE v.user_id = auth.uid() AND (p_asset_id IS NULL OR v.asset_id = p_asset_id)
  ORDER BY v.reference_date DESC, v.recorded_at DESC
$$;

CREATE TABLE public.investment_operation_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_operation_id uuid NOT NULL,
  compensating_movement_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  effective_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT investment_operation_reversals_source_owner_fk FOREIGN KEY (source_operation_id, user_id)
    REFERENCES public.investment_cash_operations(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT investment_operation_reversals_movement_owner_fk FOREIGN KEY (compensating_movement_id, user_id)
    REFERENCES public.financial_movements(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT investment_operation_reversals_source_unique UNIQUE (source_operation_id),
  CONSTRAINT investment_operation_reversals_movement_unique UNIQUE (compensating_movement_id)
);
ALTER TABLE public.investment_operation_reversals ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.investment_operation_reversals TO authenticated;
GRANT ALL ON public.investment_operation_reversals TO service_role;
CREATE POLICY "Users select own investment reversals" ON public.investment_operation_reversals
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.reverse_investment_cash_operation(
  p_operation_id uuid, p_effective_date date, p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); source public.investment_cash_operations%ROWTYPE;
  cash_account_id uuid; opposite_type text; movement_id uuid; reversal_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_effective_date IS NULL OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'A reversal date and reason are required';
  END IF;
  SELECT * INTO source FROM public.investment_cash_operations
    WHERE id = p_operation_id AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Investment operation not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.investment_operation_reversals WHERE source_operation_id = p_operation_id AND user_id = uid) THEN
    RAISE EXCEPTION 'Investment operation was already reversed';
  END IF;
  SELECT m.account_id INTO cash_account_id FROM public.financial_movements m
    WHERE m.id = source.financial_movement_id AND m.user_id = uid;
  IF cash_account_id IS NULL THEN RAISE EXCEPTION 'Source cash movement is unavailable'; END IF;
  SELECT CASE movement_type WHEN 'income' THEN 'expense' WHEN 'expense' THEN 'income' END
    INTO opposite_type FROM public.financial_movements WHERE id = source.financial_movement_id AND user_id = uid;
  IF opposite_type IS NULL THEN RAISE EXCEPTION 'Unsupported source movement type'; END IF;
  INSERT INTO public.financial_movements(user_id, account_id, effective_date, movement_type, amount, description)
    VALUES (uid, cash_account_id, p_effective_date, opposite_type, source.amount,
      'Reversão de operação de investimento: ' || left(trim(p_reason), 120)) RETURNING id INTO movement_id;
  INSERT INTO public.investment_operation_reversals(user_id, source_operation_id, compensating_movement_id, reason, effective_date)
    VALUES (uid, p_operation_id, movement_id, trim(p_reason), p_effective_date) RETURNING id INTO reversal_id;
  UPDATE public.ativos SET current_value_known = false, current_value_date = NULL, updated_at = now()
    WHERE id = source.asset_id AND user_id = uid;
  RETURN reversal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_financial_account_reconciliation(uuid, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_financial_account_reconciliations(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_investment_valuation(uuid, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_investment_valuations(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_investment_cash_operation(uuid, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_financial_transfer(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.cancel_financial_transfer_with_reason(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_financial_account_reconciliation(uuid, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_financial_account_reconciliations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_investment_valuation(uuid, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_investment_valuations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_investment_cash_operation(uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_financial_transfer_with_reason(uuid, text) TO authenticated;
