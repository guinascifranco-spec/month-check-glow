-- Investments remain separate from budget rows. Existing market values become
-- explicitly unknown until the user confirms/enters a value in the UI.
ALTER TABLE public.ativos
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'BRL'
    CHECK (currency_code ~ '^[A-Z]{3}$'),
  ADD COLUMN IF NOT EXISTS current_value_known boolean NOT NULL DEFAULT false;
ALTER TABLE public.ativos ADD COLUMN IF NOT EXISTS current_value_date date;
ALTER TABLE public.ativos ADD CONSTRAINT ativos_current_value_date_check
  CHECK (NOT current_value_known OR current_value_date IS NOT NULL);

ALTER TABLE public.ativos ADD CONSTRAINT ativos_id_user_id_key UNIQUE (id, user_id);
-- financial_movements_id_user_id_key is created in M4 (benefit_wallets).
ALTER TABLE public.aportes ADD CONSTRAINT aportes_id_user_id_key UNIQUE (id, user_id);
ALTER TABLE public.proventos ADD CONSTRAINT proventos_id_user_id_key UNIQUE (id, user_id);

CREATE TABLE public.investment_cash_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  operation_type text NOT NULL CHECK (operation_type IN ('contribution', 'redemption', 'dividend_received')),
  effective_date date NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  financial_movement_id uuid,
  aporte_id uuid,
  provento_id uuid,
  idempotency_key uuid NOT NULL,
  request_payload jsonb NOT NULL,
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT investment_cash_operations_asset_owner_fk FOREIGN KEY (asset_id, user_id)
    REFERENCES public.ativos(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT investment_cash_operations_movement_owner_fk FOREIGN KEY (financial_movement_id, user_id)
    REFERENCES public.financial_movements(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT investment_cash_operations_aporte_owner_fk FOREIGN KEY (aporte_id, user_id)
    REFERENCES public.aportes(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT investment_cash_operations_provento_owner_fk FOREIGN KEY (provento_id, user_id)
    REFERENCES public.proventos(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT investment_cash_operations_shape CHECK (
    (operation_type = 'contribution' AND financial_movement_id IS NOT NULL AND aporte_id IS NOT NULL AND provento_id IS NULL)
    OR (operation_type = 'redemption' AND financial_movement_id IS NOT NULL AND aporte_id IS NULL AND provento_id IS NULL)
    OR (operation_type = 'dividend_received' AND financial_movement_id IS NOT NULL AND aporte_id IS NULL AND provento_id IS NOT NULL)
  ),
  CONSTRAINT investment_cash_operations_user_idempotency UNIQUE (user_id, idempotency_key),
  CONSTRAINT investment_cash_operations_movement_unique UNIQUE (financial_movement_id),
  CONSTRAINT investment_cash_operations_aporte_unique UNIQUE (aporte_id),
  CONSTRAINT investment_cash_operations_provento_unique UNIQUE (provento_id)
);
CREATE INDEX investment_cash_operations_user_date_idx
  ON public.investment_cash_operations(user_id, effective_date DESC);

ALTER TABLE public.investment_cash_operations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.investment_cash_operations TO authenticated;
GRANT ALL ON public.investment_cash_operations TO service_role;
CREATE POLICY "Users select own investment cash operations"
  ON public.investment_cash_operations FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.guard_investment_linked_cash_movement()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.investment_cash_operations WHERE financial_movement_id = OLD.id) THEN
    RAISE EXCEPTION 'Investment-linked cash movements cannot be edited or deleted independently';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_investment_cash_movement_edit
  BEFORE UPDATE OR DELETE ON public.financial_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_investment_linked_cash_movement();

CREATE OR REPLACE FUNCTION public.guard_investment_operation_currency()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'ativos' AND OLD.currency_code IS DISTINCT FROM NEW.currency_code
      AND EXISTS (SELECT 1 FROM public.investment_cash_operations WHERE asset_id = OLD.id AND user_id = OLD.user_id) THEN
    RAISE EXCEPTION 'An asset currency cannot change after cash operations have been recorded';
  END IF;
  IF TG_TABLE_NAME = 'financial_accounts' AND OLD.currency_code IS DISTINCT FROM NEW.currency_code
      AND EXISTS (
        SELECT 1 FROM public.financial_movements m
        JOIN public.investment_cash_operations o ON o.financial_movement_id = m.id AND o.user_id = m.user_id
        WHERE m.account_id = OLD.id AND m.user_id = OLD.user_id
      ) THEN
    RAISE EXCEPTION 'An account currency cannot change after linked investment cash operations';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_investment_asset_currency
  BEFORE UPDATE OF currency_code ON public.ativos
  FOR EACH ROW EXECUTE FUNCTION public.guard_investment_operation_currency();
CREATE TRIGGER guard_investment_account_currency
  BEFORE UPDATE OF currency_code ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_investment_operation_currency();

CREATE OR REPLACE FUNCTION public.guard_linked_investment_record()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'aportes' AND EXISTS (
      SELECT 1 FROM public.investment_cash_operations WHERE aporte_id = OLD.id AND user_id = OLD.user_id
    ) THEN
    RAISE EXCEPTION 'A cash-linked investment contribution cannot be edited or deleted independently';
  END IF;
  IF TG_TABLE_NAME = 'proventos' AND EXISTS (
      SELECT 1 FROM public.investment_cash_operations WHERE provento_id = OLD.id AND user_id = OLD.user_id
    ) AND (OLD.ativo_id IS DISTINCT FROM NEW.ativo_id OR OLD.data_recebimento IS DISTINCT FROM NEW.data_recebimento OR OLD.valor IS DISTINCT FROM NEW.valor) THEN
    RAISE EXCEPTION 'A cash-linked dividend cannot change its asset, date, or amount';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_linked_investment_contribution
  BEFORE UPDATE OR DELETE ON public.aportes
  FOR EACH ROW EXECUTE FUNCTION public.guard_linked_investment_record();
CREATE TRIGGER guard_linked_investment_dividend
  BEFORE UPDATE OR DELETE ON public.proventos
  FOR EACH ROW EXECUTE FUNCTION public.guard_linked_investment_record();

CREATE OR REPLACE FUNCTION public.record_investment_contribution(
  p_asset_id uuid, p_account_id uuid, p_effective_date date,
  p_quantity_text text, p_unit_price_text text, p_fees_text text,
  p_description text, p_idempotency_key uuid, p_provento_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); qty numeric; unit_price numeric; fees numeric; amount_value numeric;
  asset_currency text; account_currency text; account_kind text; contribution_id uuid;
  aporte_uuid uuid; movement_uuid uuid; linked_provento uuid; request jsonb; previous record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_idempotency_key IS NULL OR p_effective_date IS NULL THEN RAISE EXCEPTION 'Operation key and date are required'; END IF;
  BEGIN
    qty := trim(p_quantity_text)::numeric; unit_price := trim(p_unit_price_text)::numeric; fees := trim(p_fees_text)::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid contribution amount'; END;
  IF qty IS NULL OR unit_price IS NULL OR fees IS NULL OR qty <= 0 OR unit_price <= 0 OR fees < 0 OR qty <> round(qty, 8) OR unit_price <> round(unit_price, 8)
      OR fees <> round(fees, 2) THEN RAISE EXCEPTION 'Invalid contribution values'; END IF;
  amount_value := round(qty * unit_price + fees, 2);
  IF amount_value <= 0 THEN RAISE EXCEPTION 'Contribution must be positive'; END IF;
  IF p_description IS NULL OR length(trim(p_description)) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid description'; END IF;
  request := jsonb_build_object('type', 'contribution', 'asset', p_asset_id, 'account', p_account_id,
    'date', p_effective_date, 'quantity', qty, 'unitPrice', unit_price, 'fees', fees,
    'description', trim(p_description), 'provento', p_provento_id);

  -- Serialize same-key retries across all investment operation types.
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_idempotency_key::text, 749));
  SELECT id, request_payload INTO previous FROM public.investment_cash_operations
    WHERE user_id = uid AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF previous.request_payload = request THEN RETURN previous.id; END IF;
    RAISE EXCEPTION 'Idempotency key was already used for a different investment request';
  END IF;
  SELECT currency_code INTO asset_currency FROM public.ativos WHERE id = p_asset_id AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset not found for this user'; END IF;
  SELECT currency_code, account_type INTO account_currency, account_kind FROM public.financial_accounts
    WHERE id = p_account_id AND user_id = uid AND is_active FOR UPDATE;
  IF NOT FOUND OR account_kind = 'benefit_wallet' THEN RAISE EXCEPTION 'Active cash account not found'; END IF;
  IF account_currency <> asset_currency THEN RAISE EXCEPTION 'Asset and account currencies must match'; END IF;
  IF p_provento_id IS NOT NULL THEN
    SELECT id INTO linked_provento FROM public.proventos
      WHERE id = p_provento_id AND ativo_id = p_asset_id AND user_id = uid AND status = 'a_reinvestir' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pending provento not found for this asset'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.investment_cash_operations
      WHERE provento_id = p_provento_id AND user_id = uid AND operation_type = 'dividend_received') THEN
      RAISE EXCEPTION 'Record the provento receipt in a cash account before linking it to a cash-funded contribution';
    END IF;
  END IF;
  INSERT INTO public.aportes(user_id, ativo_id, data, quantidade, valor_unitario, valor_total, taxas)
    VALUES (uid, p_asset_id, p_effective_date, qty, unit_price, amount_value, fees) RETURNING id INTO aporte_uuid;
  INSERT INTO public.financial_movements(user_id, account_id, effective_date, movement_type, amount, description)
    VALUES (uid, p_account_id, p_effective_date, 'expense', amount_value, trim(p_description)) RETURNING id INTO movement_uuid;
  INSERT INTO public.investment_cash_operations(user_id, asset_id, operation_type, effective_date, amount,
    currency_code, financial_movement_id, aporte_id, idempotency_key, request_payload, description)
    VALUES (uid, p_asset_id, 'contribution', p_effective_date, amount_value, asset_currency,
      movement_uuid, aporte_uuid, p_idempotency_key, request, trim(p_description)) RETURNING id INTO contribution_id;
  IF linked_provento IS NOT NULL THEN
    UPDATE public.proventos SET status = 'reinvestido', aporte_reinvestimento_id = aporte_uuid, updated_at = now()
      WHERE id = linked_provento AND user_id = uid;
  END IF;
  UPDATE public.ativos SET current_value_known = false, current_value_date = NULL, updated_at = now()
    WHERE id = p_asset_id AND user_id = uid;
  RETURN contribution_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_investment_redemption(
  p_asset_id uuid, p_account_id uuid, p_effective_date date,
  p_amount_text text, p_description text, p_idempotency_key uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); amount_value numeric; asset_currency text; account_currency text;
  account_kind text; operation_uuid uuid; movement_uuid uuid; request jsonb; previous record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_idempotency_key IS NULL OR p_effective_date IS NULL THEN RAISE EXCEPTION 'Operation key and date are required'; END IF;
  BEGIN amount_value := trim(p_amount_text)::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid redemption amount'; END;
  IF amount_value IS NULL OR amount_value <= 0 OR amount_value <> round(amount_value, 2) THEN RAISE EXCEPTION 'Redemption must be positive with at most two decimal places'; END IF;
  IF p_description IS NULL OR length(trim(p_description)) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid description'; END IF;
  request := jsonb_build_object('type', 'redemption', 'asset', p_asset_id, 'account', p_account_id,
    'date', p_effective_date, 'amount', amount_value, 'description', trim(p_description));

  -- Serialize same-key retries across all investment operation types.
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_idempotency_key::text, 749));
  SELECT id, request_payload INTO previous FROM public.investment_cash_operations
    WHERE user_id = uid AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF previous.request_payload = request THEN RETURN previous.id; END IF;
    RAISE EXCEPTION 'Idempotency key was already used for a different investment request';
  END IF;
  SELECT currency_code INTO asset_currency FROM public.ativos WHERE id = p_asset_id AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset not found for this user'; END IF;
  SELECT currency_code, account_type INTO account_currency, account_kind FROM public.financial_accounts
    WHERE id = p_account_id AND user_id = uid AND is_active FOR UPDATE;
  IF NOT FOUND OR account_kind = 'benefit_wallet' THEN RAISE EXCEPTION 'Active cash account not found'; END IF;
  IF account_currency <> asset_currency THEN RAISE EXCEPTION 'Asset and account currencies must match'; END IF;
  INSERT INTO public.financial_movements(user_id, account_id, effective_date, movement_type, amount, description)
    VALUES (uid, p_account_id, p_effective_date, 'income', amount_value, trim(p_description)) RETURNING id INTO movement_uuid;
  INSERT INTO public.investment_cash_operations(user_id, asset_id, operation_type, effective_date, amount,
    currency_code, financial_movement_id, idempotency_key, request_payload, description)
    VALUES (uid, p_asset_id, 'redemption', p_effective_date, amount_value, asset_currency,
      movement_uuid, p_idempotency_key, request, trim(p_description)) RETURNING id INTO operation_uuid;
  UPDATE public.ativos SET current_value_known = false, current_value_date = NULL, updated_at = now()
    WHERE id = p_asset_id AND user_id = uid;
  RETURN operation_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_investment_dividend_receipt(
  p_asset_id uuid, p_provento_id uuid, p_account_id uuid, p_idempotency_key uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); asset_currency text; account_currency text; account_kind text;
  amount_value numeric; received_on date; label text; movement_uuid uuid; operation_uuid uuid; request jsonb; previous record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Operation key is required'; END IF;
  request := jsonb_build_object('type', 'dividend_received', 'asset', p_asset_id,
    'account', p_account_id, 'provento', p_provento_id);

  -- Serialize same-key retries across all investment operation types.
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_idempotency_key::text, 749));
  SELECT id, request_payload INTO previous FROM public.investment_cash_operations
    WHERE user_id = uid AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF previous.request_payload = request THEN RETURN previous.id; END IF;
    RAISE EXCEPTION 'Idempotency key was already used for a different investment request';
  END IF;
  SELECT currency_code INTO asset_currency FROM public.ativos WHERE id = p_asset_id AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset not found for this user'; END IF;
  SELECT valor, data_recebimento, tipo::text INTO amount_value, received_on, label
    FROM public.proventos WHERE id = p_provento_id AND ativo_id = p_asset_id AND user_id = uid
      AND status = 'a_reinvestir' FOR UPDATE;
  IF NOT FOUND OR amount_value <= 0 OR amount_value <> round(amount_value, 2) THEN RAISE EXCEPTION 'Dividend not found or has invalid amount'; END IF;
  SELECT currency_code, account_type INTO account_currency, account_kind FROM public.financial_accounts
    WHERE id = p_account_id AND user_id = uid AND is_active FOR UPDATE;
  IF NOT FOUND OR account_kind = 'benefit_wallet' THEN RAISE EXCEPTION 'Active cash account not found'; END IF;
  IF account_currency <> asset_currency THEN RAISE EXCEPTION 'Asset and account currencies must match'; END IF;
  INSERT INTO public.financial_movements(user_id, account_id, effective_date, movement_type, amount, description)
    VALUES (uid, p_account_id, received_on, 'income', amount_value, 'Provento de investimento: ' || label) RETURNING id INTO movement_uuid;
  INSERT INTO public.investment_cash_operations(user_id, asset_id, operation_type, effective_date, amount,
    currency_code, financial_movement_id, provento_id, idempotency_key, request_payload, description)
    VALUES (uid, p_asset_id, 'dividend_received', received_on, amount_value, asset_currency,
      movement_uuid, p_provento_id, p_idempotency_key, request, 'Provento recebido em conta') RETURNING id INTO operation_uuid;
  UPDATE public.ativos SET current_value_known = false, current_value_date = NULL, updated_at = now()
    WHERE id = p_asset_id AND user_id = uid;
  RETURN operation_uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.record_investment_contribution(uuid, uuid, date, text, text, text, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_investment_redemption(uuid, uuid, date, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_investment_dividend_receipt(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_investment_contribution(uuid, uuid, date, text, text, text, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_investment_redemption(uuid, uuid, date, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_investment_dividend_receipt(uuid, uuid, uuid, uuid) TO authenticated;
