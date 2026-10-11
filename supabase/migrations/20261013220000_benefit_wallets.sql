-- Vale-alimentação uses the existing account and cash-movement ledger, but remains
-- explicitly typed so it is not mistaken for ordinary bank income or spending.
ALTER TABLE public.financial_accounts
  DROP CONSTRAINT IF EXISTS financial_accounts_account_type_check;
ALTER TABLE public.financial_accounts
  ADD CONSTRAINT financial_accounts_account_type_check
  CHECK (account_type IN ('bank_account', 'wallet', 'benefit_wallet', 'other'));

ALTER TABLE public.financial_movements
  ADD CONSTRAINT financial_movements_id_user_id_key UNIQUE (id, user_id);

CREATE TABLE public.benefit_wallet_events (
  movement_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('benefit_credit', 'benefit_purchase')),
  month_check_row_id uuid,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT benefit_wallet_events_movement_owner_fk
    FOREIGN KEY (movement_id, user_id)
    REFERENCES public.financial_movements(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT benefit_wallet_events_budget_row_owner_fk
    FOREIGN KEY (month_check_row_id, user_id)
    REFERENCES public.month_check_rows(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT benefit_wallet_events_type_row_check CHECK (
    (event_type = 'benefit_credit' AND month_check_row_id IS NULL)
    OR event_type = 'benefit_purchase'
  ),
  CONSTRAINT benefit_wallet_events_idempotency_unique UNIQUE (user_id, idempotency_key),
  CONSTRAINT benefit_wallet_events_budget_row_unique UNIQUE (month_check_row_id)
);

CREATE INDEX benefit_wallet_events_user_created_idx
  ON public.benefit_wallet_events(user_id, created_at DESC);

ALTER TABLE public.benefit_wallet_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.benefit_wallet_events TO authenticated;
GRANT ALL ON public.benefit_wallet_events TO service_role;
CREATE POLICY "Users select own benefit wallet events"
  ON public.benefit_wallet_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- Writes are only allowed through record_benefit_wallet_event().

CREATE OR REPLACE FUNCTION public.guard_linked_benefit_budget_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.transaction_date IS DISTINCT FROM OLD.transaction_date OR
    NEW.tipo IS DISTINCT FROM OLD.tipo OR NEW.valor IS DISTINCT FROM OLD.valor OR
    coalesce(NEW.invoice_payment, false) IS DISTINCT FROM coalesce(OLD.invoice_payment, false)
  ) AND EXISTS (
    SELECT 1 FROM public.benefit_wallet_events e
    WHERE e.month_check_row_id = OLD.id AND e.user_id = OLD.user_id
  ) THEN
    RAISE EXCEPTION 'Unlink the VA purchase before changing its date, type, or amount';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER month_check_rows_guard_benefit_link
  BEFORE UPDATE ON public.month_check_rows
  FOR EACH ROW EXECUTE FUNCTION public.guard_linked_benefit_budget_row();

CREATE OR REPLACE FUNCTION public.guard_benefit_wallet_account_type()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.account_type IS DISTINCT FROM NEW.account_type AND EXISTS (
    SELECT 1 FROM public.financial_movements m WHERE m.account_id = OLD.id AND m.user_id = OLD.user_id
    UNION ALL
    SELECT 1 FROM public.credit_cards c WHERE c.payment_account_id = OLD.id AND c.user_id = OLD.user_id
  ) THEN
    RAISE EXCEPTION 'Account type cannot change after financial activity or card use';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER financial_accounts_guard_benefit_type
  BEFORE UPDATE OF account_type ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_benefit_wallet_account_type();

CREATE OR REPLACE FUNCTION public.guard_credit_card_benefit_payment_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.payment_account_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.financial_accounts a
    WHERE a.id = NEW.payment_account_id AND a.user_id = NEW.user_id AND a.account_type = 'benefit_wallet'
  ) THEN
    RAISE EXCEPTION 'Credit card invoices must be paid from a bank or cash account';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER credit_cards_guard_benefit_payment_account
  BEFORE INSERT OR UPDATE OF payment_account_id ON public.credit_cards
  FOR EACH ROW EXECUTE FUNCTION public.guard_credit_card_benefit_payment_account();

CREATE OR REPLACE FUNCTION public.guard_benefit_wallet_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE account_kind text; is_benefit_event boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.benefit_wallet_events e WHERE e.movement_id = OLD.id AND e.user_id = OLD.user_id) THEN
      RAISE EXCEPTION 'Benefit wallet events cannot be edited or deleted independently';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1 FROM public.benefit_wallet_events e WHERE e.movement_id = OLD.id AND e.user_id = OLD.user_id
  ) AND (
    NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.effective_date IS DISTINCT FROM OLD.effective_date OR
    NEW.movement_type IS DISTINCT FROM OLD.movement_type OR NEW.amount IS DISTINCT FROM OLD.amount OR
    NEW.description IS DISTINCT FROM OLD.description OR NEW.transfer_id IS DISTINCT FROM OLD.transfer_id OR
    NEW.credit_card_payment_id IS DISTINCT FROM OLD.credit_card_payment_id
  ) THEN
    RAISE EXCEPTION 'Benefit wallet events cannot be edited independently';
  END IF;

  SELECT a.account_type INTO account_kind FROM public.financial_accounts a
    WHERE a.id = NEW.account_id AND a.user_id = NEW.user_id;
  IF account_kind = 'benefit_wallet' THEN
    IF NEW.movement_type NOT IN ('income', 'expense') OR NEW.transfer_id IS NOT NULL OR NEW.credit_card_payment_id IS NOT NULL THEN
      RAISE EXCEPTION 'Benefit wallets only accept explicit credits and purchases';
    END IF;
  ELSIF NEW.transfer_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.financial_transfers t
    JOIN public.financial_accounts a ON a.id IN (t.from_account_id, t.to_account_id) AND a.user_id = t.user_id
    WHERE t.id = NEW.transfer_id AND t.user_id = NEW.user_id AND a.account_type = 'benefit_wallet'
  ) THEN
    RAISE EXCEPTION 'Transfers to or from benefit wallets are not supported';
  END IF;

  IF NEW.credit_card_payment_id IS NOT NULL AND account_kind = 'benefit_wallet' THEN
    RAISE EXCEPTION 'A benefit wallet cannot pay a credit card invoice';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER financial_movements_guard_benefit_wallet
  BEFORE INSERT OR UPDATE OR DELETE ON public.financial_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_benefit_wallet_movement();

CREATE OR REPLACE FUNCTION public.assert_benefit_wallet_movement_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE account_kind text; expected_event text; actual_event text;
BEGIN
  SELECT a.account_type INTO account_kind FROM public.financial_accounts a
    WHERE a.id = NEW.account_id AND a.user_id = NEW.user_id;
  SELECT e.event_type INTO actual_event FROM public.benefit_wallet_events e
    WHERE e.movement_id = NEW.id AND e.user_id = NEW.user_id;
  IF account_kind = 'benefit_wallet' THEN
    expected_event := CASE NEW.movement_type WHEN 'income' THEN 'benefit_credit' WHEN 'expense' THEN 'benefit_purchase' ELSE NULL END;
    IF expected_event IS NULL OR actual_event IS DISTINCT FROM expected_event THEN
      RAISE EXCEPTION 'Benefit wallet movement must have a matching explicit event';
    END IF;
  ELSIF actual_event IS NOT NULL THEN
    RAISE EXCEPTION 'Benefit wallet event must belong to a benefit wallet account';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER financial_movements_benefit_event_check
  AFTER INSERT OR UPDATE ON public.financial_movements
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.assert_benefit_wallet_movement_event();

CREATE OR REPLACE FUNCTION public.create_financial_transfer(
  p_from_account_id uuid, p_to_account_id uuid, p_effective_date date,
  p_amount_text text, p_description text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); amount_value numeric; source_currency text; target_currency text;
  transfer_uuid uuid; lock_id uuid; source_kind text; target_kind text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_from_account_id = p_to_account_id OR p_effective_date IS NULL THEN RAISE EXCEPTION 'Invalid transfer accounts or date'; END IF;
  IF p_description IS NULL OR length(trim(p_description)) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid description'; END IF;
  BEGIN amount_value := trim(p_amount_text)::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid amount'; END;
  IF amount_value IS NULL OR amount_value <= 0 OR amount_value <> round(amount_value, 2) OR amount_value >= 1000000000000 THEN
    RAISE EXCEPTION 'Amount must be positive with at most two decimal places';
  END IF;
  FOR lock_id IN SELECT unnest(ARRAY[p_from_account_id, p_to_account_id]) ORDER BY 1 LOOP
    PERFORM 1 FROM public.financial_accounts WHERE id = lock_id AND user_id = uid AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Both accounts must belong to this user and be active'; END IF;
  END LOOP;
  SELECT currency_code, account_type INTO source_currency, source_kind FROM public.financial_accounts WHERE id = p_from_account_id AND user_id = uid;
  SELECT currency_code, account_type INTO target_currency, target_kind FROM public.financial_accounts WHERE id = p_to_account_id AND user_id = uid;
  IF source_kind = 'benefit_wallet' OR target_kind = 'benefit_wallet' THEN RAISE EXCEPTION 'Transfers to or from benefit wallets are not supported'; END IF;
  IF source_currency <> target_currency THEN RAISE EXCEPTION 'Transfers between different currencies are not supported'; END IF;
  INSERT INTO public.financial_transfers(user_id, from_account_id, to_account_id, effective_date, amount, description)
    VALUES (uid, p_from_account_id, p_to_account_id, p_effective_date, amount_value, trim(p_description)) RETURNING id INTO transfer_uuid;
  INSERT INTO public.financial_movements(user_id, account_id, effective_date, movement_type, amount, description, transfer_id)
    VALUES (uid, p_from_account_id, p_effective_date, 'transfer_out', amount_value, trim(p_description), transfer_uuid),
      (uid, p_to_account_id, p_effective_date, 'transfer_in', amount_value, trim(p_description), transfer_uuid);
  RETURN transfer_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_credit_card_payment(
  p_invoice_id uuid, p_account_id uuid, p_effective_date date,
  p_amount_text text, p_idempotency_key uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); total_value numeric; paid_value numeric; amount_value numeric;
  invoice_currency text; account_currency text; invoice_uuid uuid; payment_uuid uuid; account_kind text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_effective_date IS NULL OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Date and idempotency key are required'; END IF;
  BEGIN amount_value := trim(p_amount_text)::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid payment amount'; END;
  IF amount_value IS NULL OR amount_value <= 0 OR amount_value <> round(amount_value, 2) OR amount_value >= 1000000000000 THEN RAISE EXCEPTION 'Invalid payment amount'; END IF;
  SELECT i.id, i.total_amount, i.currency_code INTO invoice_uuid, total_value, invoice_currency
    FROM public.credit_card_invoices i WHERE i.id = p_invoice_id AND i.user_id = uid AND i.closed_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only a closed invoice can be paid'; END IF;
  SELECT id INTO payment_uuid FROM public.credit_card_payments WHERE user_id = uid AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF EXISTS (SELECT 1 FROM public.credit_card_payments WHERE id = payment_uuid AND invoice_id = p_invoice_id
      AND account_id = p_account_id AND effective_date = p_effective_date AND amount = amount_value) THEN RETURN payment_uuid; END IF;
    RAISE EXCEPTION 'Idempotency key was already used for a different payment';
  END IF;
  SELECT currency_code, account_type INTO account_currency, account_kind FROM public.financial_accounts
    WHERE id = p_account_id AND user_id = uid AND is_active FOR UPDATE;
  IF NOT FOUND OR account_kind = 'benefit_wallet' THEN RAISE EXCEPTION 'Payment account must be an active bank or cash account'; END IF;
  IF account_currency <> invoice_currency THEN RAISE EXCEPTION 'Payment account and invoice currencies must match'; END IF;
  SELECT coalesce(sum(amount), 0) INTO paid_value FROM public.credit_card_payments WHERE invoice_id = p_invoice_id AND user_id = uid;
  IF paid_value + amount_value > total_value THEN RAISE EXCEPTION 'Payment exceeds invoice amount due'; END IF;
  INSERT INTO public.credit_card_payments(user_id, invoice_id, account_id, effective_date, amount, idempotency_key)
    VALUES (uid, p_invoice_id, p_account_id, p_effective_date, amount_value, p_idempotency_key)
    ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING id INTO payment_uuid;
  IF NOT FOUND THEN
    SELECT id INTO payment_uuid FROM public.credit_card_payments WHERE user_id = uid AND idempotency_key = p_idempotency_key;
    IF EXISTS (SELECT 1 FROM public.credit_card_payments WHERE id = payment_uuid AND invoice_id = p_invoice_id
      AND account_id = p_account_id AND effective_date = p_effective_date AND amount = amount_value) THEN RETURN payment_uuid; END IF;
    RAISE EXCEPTION 'Idempotency key was already used for a different payment';
  END IF;
  INSERT INTO public.financial_movements(user_id, account_id, effective_date, movement_type, amount, description, credit_card_payment_id)
    VALUES (uid, p_account_id, p_effective_date, 'expense', amount_value, 'Pagamento de fatura', payment_uuid);
  RETURN payment_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_benefit_wallet_event(
  p_account_id uuid, p_effective_date date, p_event_type text, p_amount_text text,
  p_description text, p_category_id uuid, p_month_check_row_id uuid, p_idempotency_key uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); amount_value numeric; new_movement_id uuid; wallet_currency text;
  expected_movement_type text; previous record; budget_row record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_effective_date IS NULL OR p_idempotency_key IS NULL OR p_event_type NOT IN ('benefit_credit', 'benefit_purchase') THEN
    RAISE EXCEPTION 'Invalid benefit event';
  END IF;
  IF p_description IS NULL OR length(trim(p_description)) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid description'; END IF;
  BEGIN amount_value := trim(p_amount_text)::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid amount'; END;
  IF amount_value IS NULL OR amount_value <= 0 OR amount_value <> round(amount_value, 2) OR amount_value >= 1000000000000 THEN
    RAISE EXCEPTION 'Amount must be positive with at most two decimal places';
  END IF;
  expected_movement_type := CASE p_event_type WHEN 'benefit_credit' THEN 'income' ELSE 'expense' END;
  IF p_event_type = 'benefit_credit' AND (p_category_id IS NOT NULL OR p_month_check_row_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Benefit credits cannot have a category or budget purchase association';
  END IF;
  SELECT currency_code INTO wallet_currency FROM public.financial_accounts
    WHERE id = p_account_id AND user_id = uid AND account_type = 'benefit_wallet' AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active benefit wallet not found'; END IF;
  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.expense_categories WHERE id = p_category_id AND user_id = uid
  ) THEN RAISE EXCEPTION 'Category not found for this user'; END IF;
  IF p_month_check_row_id IS NOT NULL THEN
    IF p_event_type <> 'benefit_purchase' OR wallet_currency <> 'BRL' THEN RAISE EXCEPTION 'Only BRL purchases can link to a budget row'; END IF;
    SELECT id INTO budget_row FROM public.month_check_rows r WHERE r.id = p_month_check_row_id AND r.user_id = uid
      AND r.tipo = 'saida' AND r.transaction_date = p_effective_date AND r.valor = amount_value
      AND coalesce(r.invoice_payment, false) = false
      AND NOT EXISTS (SELECT 1 FROM public.credit_card_invoice_items i WHERE i.month_check_row_id = r.id AND i.user_id = uid)
      FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Budget row must be an unlinked expense with matching date and full amount'; END IF;
  END IF;

  SELECT e.movement_id, e.event_type, e.month_check_row_id, m.account_id, m.effective_date, m.movement_type,
      m.amount, m.description, m.category_id
    INTO previous FROM public.benefit_wallet_events e JOIN public.financial_movements m
      ON m.id = e.movement_id AND m.user_id = e.user_id
    WHERE e.user_id = uid AND e.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF previous.account_id = p_account_id AND previous.effective_date = p_effective_date
      AND previous.event_type = p_event_type AND previous.movement_type = expected_movement_type
      AND previous.amount = amount_value AND previous.description = trim(p_description)
      AND previous.category_id IS NOT DISTINCT FROM p_category_id
      AND previous.month_check_row_id IS NOT DISTINCT FROM p_month_check_row_id THEN RETURN previous.movement_id; END IF;
    RAISE EXCEPTION 'Idempotency key was already used for a different benefit event';
  END IF;

  INSERT INTO public.financial_movements(user_id, account_id, effective_date, movement_type, amount, description, category_id)
    VALUES (uid, p_account_id, p_effective_date, expected_movement_type, amount_value, trim(p_description), p_category_id)
    RETURNING id INTO new_movement_id;
  INSERT INTO public.benefit_wallet_events(movement_id, user_id, event_type, month_check_row_id, idempotency_key)
    VALUES (new_movement_id, uid, p_event_type, p_month_check_row_id, p_idempotency_key);
  RETURN new_movement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlink_benefit_budget_row(p_movement_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); saved_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.benefit_wallet_events e SET month_check_row_id = NULL
  FROM public.financial_movements m
  WHERE e.movement_id = p_movement_id AND e.user_id = uid AND e.event_type = 'benefit_purchase'
    AND e.month_check_row_id IS NOT NULL AND m.id = e.movement_id AND m.user_id = e.user_id
  RETURNING e.movement_id INTO saved_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Linked benefit purchase not found'; END IF;
  RETURN saved_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_benefit_wallet_events(
  p_from_date date, p_to_date date, p_account_id uuid
) RETURNS TABLE (
  movement_id uuid, account_id uuid, effective_date date, event_type text, amount text,
  description text, category_id uuid, category_name text, month_check_row_id uuid,
  budget_description text, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_from_date IS NULL OR p_to_date IS NULL OR p_from_date > p_to_date THEN RAISE EXCEPTION 'Invalid period'; END IF;
  IF p_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.financial_accounts WHERE id = p_account_id AND user_id = uid AND account_type = 'benefit_wallet'
  ) THEN RAISE EXCEPTION 'Benefit wallet not found'; END IF;
  RETURN QUERY SELECT m.id, m.account_id, m.effective_date, e.event_type, m.amount::text,
    m.description, m.category_id, c.name, e.month_check_row_id, r.descricao, m.created_at
  FROM public.benefit_wallet_events e
  JOIN public.financial_movements m ON m.id = e.movement_id AND m.user_id = e.user_id
  LEFT JOIN public.expense_categories c ON c.id = m.category_id AND c.user_id = m.user_id
  LEFT JOIN public.month_check_rows r ON r.id = e.month_check_row_id AND r.user_id = e.user_id
  WHERE e.user_id = uid AND m.effective_date BETWEEN p_from_date AND p_to_date
    AND (p_account_id IS NULL OR m.account_id = p_account_id)
  ORDER BY m.effective_date DESC, m.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_unlinked_benefit_budget_rows()
RETURNS TABLE (id uuid, transaction_date date, descricao text, valor text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN QUERY SELECT r.id, r.transaction_date, r.descricao, r.valor::text
  FROM public.month_check_rows r
  WHERE r.user_id = uid AND r.tipo = 'saida' AND r.transaction_date IS NOT NULL
    AND coalesce(r.invoice_payment, false) = false
    AND NOT EXISTS (SELECT 1 FROM public.benefit_wallet_events e WHERE e.month_check_row_id = r.id AND e.user_id = uid)
    AND NOT EXISTS (SELECT 1 FROM public.credit_card_invoice_items i WHERE i.month_check_row_id = r.id AND i.user_id = uid)
  ORDER BY r.transaction_date DESC, r.created_at DESC LIMIT 500;
END;
$$;

REVOKE ALL ON FUNCTION public.record_benefit_wallet_event(uuid,date,text,text,text,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unlink_benefit_budget_row(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_benefit_wallet_events(date,date,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_unlinked_benefit_budget_rows() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_benefit_wallet_event(uuid,date,text,text,text,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_benefit_budget_row(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_benefit_wallet_events(date,date,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_unlinked_benefit_budget_rows() TO authenticated;
