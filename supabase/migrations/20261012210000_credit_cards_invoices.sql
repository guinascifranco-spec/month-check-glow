-- Card statements and their payments stay separate from budget transactions.
ALTER TABLE public.month_check_rows
  ADD COLUMN IF NOT EXISTS invoice_card text,
  ADD COLUMN IF NOT EXISTS invoice_line integer,
  ADD COLUMN IF NOT EXISTS invoice_payment boolean,
  ADD COLUMN IF NOT EXISTS invoice_source text,
  ADD COLUMN IF NOT EXISTS invoice_installment_current integer,
  ADD COLUMN IF NOT EXISTS invoice_installment_total integer,
  ADD COLUMN IF NOT EXISTS invoice_responsibility text,
  ADD COLUMN IF NOT EXISTS invoice_personal_value numeric(14, 2),
  ADD CONSTRAINT month_check_rows_id_user_id_key UNIQUE (id, user_id);

CREATE TABLE public.credit_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  last_four text CHECK (last_four IS NULL OR last_four ~ '^[0-9]{4}$'),
  currency_code text NOT NULL DEFAULT 'BRL' CHECK (currency_code ~ '^[A-Z]{3}$'),
  payment_account_id uuid,
  closing_day integer CHECK (closing_day BETWEEN 1 AND 31),
  due_day integer CHECK (due_day BETWEEN 1 AND 31),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_cards_id_user_id_key UNIQUE (id, user_id),
  CONSTRAINT credit_cards_payment_account_owner_fk FOREIGN KEY (payment_account_id, user_id)
    REFERENCES public.financial_accounts(id, user_id) ON DELETE RESTRICT
);

CREATE TABLE public.credit_card_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  closing_date date,
  due_date date,
  total_amount numeric(14, 2) NOT NULL CHECK (total_amount > 0),
  closed_at timestamptz,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'imported')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_card_invoices_period_valid CHECK (period_start <= period_end),
  CONSTRAINT credit_card_invoices_id_user_id_key UNIQUE (id, user_id),
  CONSTRAINT credit_card_invoices_card_owner_fk FOREIGN KEY (card_id, user_id)
    REFERENCES public.credit_cards(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT credit_card_invoices_card_period_unique UNIQUE (card_id, period_start, period_end)
);

CREATE TABLE public.credit_card_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL,
  account_id uuid NOT NULL,
  effective_date date NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_card_payments_id_user_id_key UNIQUE (id, user_id),
  CONSTRAINT credit_card_payments_idempotency_key UNIQUE (user_id, idempotency_key),
  CONSTRAINT credit_card_payments_invoice_owner_fk FOREIGN KEY (invoice_id, user_id)
    REFERENCES public.credit_card_invoices(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT credit_card_payments_account_owner_fk FOREIGN KEY (account_id, user_id)
    REFERENCES public.financial_accounts(id, user_id) ON DELETE RESTRICT
);

CREATE TABLE public.credit_card_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL,
  month_check_row_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_card_invoice_items_invoice_owner_fk FOREIGN KEY (invoice_id, user_id)
    REFERENCES public.credit_card_invoices(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT credit_card_invoice_items_row_owner_fk FOREIGN KEY (month_check_row_id, user_id)
    REFERENCES public.month_check_rows(id, user_id) ON DELETE CASCADE,
  CONSTRAINT credit_card_invoice_items_row_unique UNIQUE (month_check_row_id),
  CONSTRAINT credit_card_invoice_items_invoice_row_unique UNIQUE (invoice_id, month_check_row_id)
);

ALTER TABLE public.financial_movements
  ADD COLUMN credit_card_payment_id uuid,
  ADD CONSTRAINT financial_movements_card_payment_shape CHECK (
    credit_card_payment_id IS NULL OR
      (movement_type = 'expense' AND transfer_id IS NULL AND category_id IS NULL)
  ),
  ADD CONSTRAINT financial_movements_card_payment_owner_fk
    FOREIGN KEY (credit_card_payment_id, user_id)
    REFERENCES public.credit_card_payments(id, user_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX financial_movements_card_payment_unique
  ON public.financial_movements(credit_card_payment_id)
  WHERE credit_card_payment_id IS NOT NULL;

-- Payment cash movements are immutable through the ordinary movement endpoints.
CREATE OR REPLACE FUNCTION public.update_financial_movement(
  p_id uuid, p_account_id uuid, p_effective_date date, p_movement_type text,
  p_amount_text text, p_description text, p_category_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); amount_value numeric; old_account_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_movement_type NOT IN ('income', 'expense') THEN RAISE EXCEPTION 'Invalid movement type'; END IF;
  IF p_effective_date IS NULL THEN RAISE EXCEPTION 'Effective date is required'; END IF;
  IF p_description IS NULL OR length(trim(p_description)) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid description'; END IF;
  BEGIN amount_value := trim(p_amount_text)::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid amount'; END;
  IF amount_value IS NULL OR amount_value <= 0 OR amount_value <> round(amount_value, 2) OR amount_value >= 1000000000000 THEN RAISE EXCEPTION 'Amount must be positive and have at most two decimal places'; END IF;
  SELECT account_id INTO old_account_id FROM public.financial_movements
    WHERE id = p_id AND user_id = uid AND transfer_id IS NULL AND credit_card_payment_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only ordinary movements can be edited'; END IF;
  PERFORM 1 FROM public.financial_accounts
    WHERE id = p_account_id AND user_id = uid AND (is_active OR p_account_id = old_account_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active account not found'; END IF;
  IF p_category_id IS NOT NULL AND (p_movement_type <> 'expense' OR NOT EXISTS (
    SELECT 1 FROM public.expense_categories WHERE id = p_category_id AND user_id = uid
  )) THEN RAISE EXCEPTION 'Category not found for this user'; END IF;
  UPDATE public.financial_movements SET account_id = p_account_id, effective_date = p_effective_date,
    movement_type = p_movement_type, amount = amount_value, description = trim(p_description),
    category_id = p_category_id, updated_at = now()
    WHERE id = p_id AND user_id = uid AND transfer_id IS NULL AND credit_card_payment_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movement is immutable or no longer exists'; END IF;
  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_financial_movement(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  DELETE FROM public.financial_movements
    WHERE id = p_id AND user_id = uid AND transfer_id IS NULL AND credit_card_payment_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movement not found or belongs to a transfer/card payment'; END IF;
END;
$$;

-- Keep card payment movements identifiable in the cash ledger while preserving its public result shape.
CREATE OR REPLACE FUNCTION public.list_financial_movements(
  p_from_date date, p_to_date date, p_account_id uuid DEFAULT NULL
) RETURNS TABLE (
  id uuid, account_id uuid, account_name text, related_account_name text,
  effective_date date, movement_type text, amount text, description text,
  category_id uuid, category_name text, transfer_id uuid, transfer_status text, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_from_date IS NULL OR p_to_date IS NULL OR p_from_date > p_to_date THEN RAISE EXCEPTION 'Invalid date range'; END IF;
  RETURN QUERY
    SELECT m.id, m.account_id, a.name,
      CASE WHEN m.movement_type = 'transfer_out' THEN target.name
           WHEN m.movement_type = 'transfer_in' THEN source.name ELSE NULL END,
      m.effective_date, m.movement_type, m.amount::text,
      CASE WHEN payment.id IS NOT NULL THEN
        'Pagamento da fatura ' || card.name || ' (' || to_char(invoice.period_start, 'MM/YYYY') || ')'
        WHEN transfer.id IS NOT NULL THEN transfer.description ELSE m.description END,
      m.category_id, category.name, m.transfer_id, transfer.status, m.created_at
    FROM public.financial_movements m
    JOIN public.financial_accounts a ON a.id = m.account_id AND a.user_id = m.user_id
    LEFT JOIN public.financial_transfers transfer ON transfer.id = m.transfer_id AND transfer.user_id = m.user_id
    LEFT JOIN public.financial_accounts source ON source.id = transfer.from_account_id AND source.user_id = transfer.user_id
    LEFT JOIN public.financial_accounts target ON target.id = transfer.to_account_id AND target.user_id = transfer.user_id
    LEFT JOIN public.expense_categories category ON category.id = m.category_id AND category.user_id = m.user_id
    LEFT JOIN public.credit_card_payments payment ON payment.id = m.credit_card_payment_id AND payment.user_id = m.user_id
    LEFT JOIN public.credit_card_invoices invoice ON invoice.id = payment.invoice_id AND invoice.user_id = payment.user_id
    LEFT JOIN public.credit_cards card ON card.id = invoice.card_id AND card.user_id = invoice.user_id
    WHERE m.user_id = uid AND m.effective_date BETWEEN p_from_date AND p_to_date
      AND (p_account_id IS NULL OR m.account_id = p_account_id)
    ORDER BY m.effective_date DESC, m.created_at DESC;
END;
$$;

CREATE INDEX credit_cards_user_active_idx ON public.credit_cards(user_id, is_active, name);
CREATE INDEX credit_card_invoices_user_due_idx ON public.credit_card_invoices(user_id, due_date DESC);
CREATE INDEX credit_card_payments_invoice_date_idx ON public.credit_card_payments(invoice_id, effective_date);
CREATE INDEX credit_card_invoice_items_invoice_idx ON public.credit_card_invoice_items(invoice_id);

ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_invoice_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.credit_cards, public.credit_card_invoices,
  public.credit_card_payments, public.credit_card_invoice_items TO authenticated;
GRANT ALL ON public.credit_cards, public.credit_card_invoices,
  public.credit_card_payments, public.credit_card_invoice_items TO service_role;

CREATE POLICY "Users select own cards" ON public.credit_cards FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users select own card invoices" ON public.credit_card_invoices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users select own card payments" ON public.credit_card_payments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users select own invoice items" ON public.credit_card_invoice_items FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- All writes are authenticated RPCs with explicit owner checks; there is no direct DML grant.
CREATE OR REPLACE FUNCTION public.list_credit_cards()
RETURNS TABLE (id uuid, name text, last_four text, currency_code text, payment_account_id uuid,
  payment_account_name text, closing_day integer, due_day integer, is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id, c.name, c.last_four, c.currency_code, c.payment_account_id, a.name,
    c.closing_day, c.due_day, c.is_active
  FROM public.credit_cards c
  LEFT JOIN public.financial_accounts a ON a.id = c.payment_account_id AND a.user_id = c.user_id
  WHERE c.user_id = auth.uid() ORDER BY c.is_active DESC, c.name
$$;

CREATE OR REPLACE FUNCTION public.save_credit_card(
  p_id uuid, p_name text, p_last_four text, p_currency_code text,
  p_payment_account_id uuid, p_closing_day integer, p_due_day integer
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); account_currency text; saved_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Invalid card name'; END IF;
  IF p_last_four IS NOT NULL AND p_last_four !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'Last four digits must contain four numbers'; END IF;
  IF p_currency_code IS NULL OR p_currency_code !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Invalid currency'; END IF;
  IF (p_closing_day IS NOT NULL AND p_closing_day NOT BETWEEN 1 AND 31)
    OR (p_due_day IS NOT NULL AND p_due_day NOT BETWEEN 1 AND 31) THEN RAISE EXCEPTION 'Invalid billing day'; END IF;
  IF p_payment_account_id IS NOT NULL THEN
    SELECT currency_code INTO account_currency FROM public.financial_accounts
      WHERE id = p_payment_account_id AND user_id = uid AND is_active FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment account must be active and belong to this user'; END IF;
    IF account_currency <> p_currency_code THEN RAISE EXCEPTION 'Card and payment account currencies must match'; END IF;
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.credit_cards(user_id, name, last_four, currency_code, payment_account_id, closing_day, due_day)
    VALUES (uid, trim(p_name), p_last_four, p_currency_code, p_payment_account_id, p_closing_day, p_due_day)
    RETURNING id INTO saved_id;
  ELSE
    PERFORM 1 FROM public.credit_cards WHERE id = p_id AND user_id = uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;
    IF EXISTS (SELECT 1 FROM public.credit_card_invoices WHERE card_id = p_id AND user_id = uid)
      AND EXISTS (SELECT 1 FROM public.credit_cards WHERE id = p_id AND user_id = uid AND currency_code <> p_currency_code) THEN
      RAISE EXCEPTION 'Card currency cannot change after invoices have been recorded';
    END IF;
    UPDATE public.credit_cards SET name = trim(p_name), last_four = p_last_four,
      currency_code = p_currency_code, payment_account_id = p_payment_account_id,
      closing_day = p_closing_day, due_day = p_due_day, updated_at = now()
      WHERE id = p_id AND user_id = uid RETURNING id INTO saved_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;
  END IF;
  RETURN saved_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_credit_card_active(p_id uuid, p_is_active boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); saved_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.credit_cards SET is_active = p_is_active, updated_at = now()
    WHERE id = p_id AND user_id = uid RETURNING id INTO saved_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;
  RETURN saved_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_credit_card_invoice(
  p_card_id uuid, p_period_start date, p_period_end date, p_closing_date date,
  p_due_date date, p_total_text text, p_source text DEFAULT 'manual'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); total_value numeric; invoice_uuid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end THEN RAISE EXCEPTION 'Invalid invoice period'; END IF;
  IF p_due_date IS NOT NULL AND p_closing_date IS NOT NULL AND p_due_date < p_closing_date THEN RAISE EXCEPTION 'Due date cannot be before closing date'; END IF;
  IF p_source NOT IN ('manual', 'imported') THEN RAISE EXCEPTION 'Invalid invoice source'; END IF;
  BEGIN total_value := trim(p_total_text)::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid invoice total'; END;
  IF total_value IS NULL OR total_value <= 0 OR total_value <> round(total_value, 2) OR total_value >= 1000000000000 THEN RAISE EXCEPTION 'Invoice total must be positive with at most two decimal places'; END IF;
  PERFORM 1 FROM public.credit_cards WHERE id = p_card_id AND user_id = uid AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;
  INSERT INTO public.credit_card_invoices(user_id, card_id, period_start, period_end, currency_code, closing_date, due_date, total_amount, source)
  SELECT uid, p_card_id, p_period_start, p_period_end, c.currency_code, p_closing_date, p_due_date, total_value, p_source
    FROM public.credit_cards c WHERE c.id = p_card_id AND c.user_id = uid
  RETURNING id INTO invoice_uuid;
  RETURN invoice_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_credit_card_invoice(p_invoice_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); saved_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.credit_card_invoices SET closed_at = now(), updated_at = now()
    WHERE id = p_invoice_id AND user_id = uid AND closed_at IS NULL RETURNING id INTO saved_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Open invoice not found'; END IF;
  RETURN saved_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_credit_card_invoice(p_invoice_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid(); saved_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  PERFORM 1 FROM public.credit_card_invoices WHERE id = p_invoice_id AND user_id = uid AND closed_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Closed invoice not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.credit_card_payments WHERE invoice_id = p_invoice_id AND user_id = uid) THEN
    RAISE EXCEPTION 'An invoice with payments cannot be reopened';
  END IF;
  UPDATE public.credit_card_invoices SET closed_at = NULL, updated_at = now()
    WHERE id = p_invoice_id AND user_id = uid RETURNING id INTO saved_id;
  RETURN saved_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_credit_card_invoices()
RETURNS TABLE (id uuid, card_id uuid, card_name text, currency_code text, period_start date,
  period_end date, closing_date date, due_date date, total_amount text, paid_amount text,
  remaining_amount text, closed_at timestamptz, source text, item_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT i.id, i.card_id, c.name, i.currency_code, i.period_start, i.period_end,
    i.closing_date, i.due_date, i.total_amount::text,
    coalesce(p.paid_amount, 0)::text,
    (i.total_amount - coalesce(p.paid_amount, 0))::text,
    i.closed_at, i.source, coalesce(items.item_count, 0)
  FROM public.credit_card_invoices i
  JOIN public.credit_cards c ON c.id = i.card_id AND c.user_id = i.user_id
  LEFT JOIN LATERAL (
    SELECT sum(p.amount) AS paid_amount FROM public.credit_card_payments p
    WHERE p.invoice_id = i.id AND p.user_id = i.user_id
  ) p ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS item_count FROM public.credit_card_invoice_items x
    WHERE x.invoice_id = i.id AND x.user_id = i.user_id
  ) items ON true
  WHERE i.user_id = auth.uid()
  ORDER BY i.period_start DESC, i.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.list_unlinked_invoice_rows(p_limit integer DEFAULT 200)
RETURNS TABLE (id uuid, transaction_date date, descricao text, tipo text, valor text,
  invoice_card text, invoice_source text, invoice_installment_current integer,
  invoice_installment_total integer, invoice_responsibility text, invoice_personal_value text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN QUERY SELECT r.id, r.transaction_date, r.descricao, r.tipo, r.valor::text, r.invoice_card,
    r.invoice_source, r.invoice_installment_current, r.invoice_installment_total,
    r.invoice_responsibility, r.invoice_personal_value::text
  FROM public.month_check_rows r
  WHERE r.user_id = uid AND r.tipo IN ('saida', 'entrada') AND coalesce(r.invoice_payment, false) = false
    AND NOT EXISTS (SELECT 1 FROM public.credit_card_invoice_items x WHERE x.month_check_row_id = r.id AND x.user_id = uid)
  ORDER BY r.transaction_date DESC NULLS LAST, r.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 200), 1), 500);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_credit_card_invoice_items(p_invoice_id uuid)
RETURNS TABLE (id uuid, transaction_date date, descricao text, tipo text, valor text,
  invoice_card text, invoice_source text, invoice_installment_current integer,
  invoice_installment_total integer, invoice_responsibility text, invoice_personal_value text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.credit_card_invoices WHERE id = p_invoice_id AND user_id = uid) THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  RETURN QUERY SELECT r.id, r.transaction_date, r.descricao, r.tipo, r.valor::text, r.invoice_card,
    r.invoice_source, r.invoice_installment_current, r.invoice_installment_total,
    r.invoice_responsibility, r.invoice_personal_value::text
  FROM public.credit_card_invoice_items i
  JOIN public.month_check_rows r ON r.id = i.month_check_row_id AND r.user_id = i.user_id
  WHERE i.invoice_id = p_invoice_id AND i.user_id = uid
  ORDER BY r.transaction_date NULLS LAST, r.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.associate_credit_card_invoice_row(p_invoice_id uuid, p_row_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  PERFORM 1 FROM public.credit_card_invoices WHERE id = p_invoice_id AND user_id = uid AND closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Open invoice not found'; END IF;
  PERFORM 1 FROM public.month_check_rows WHERE id = p_row_id AND user_id = uid
    AND tipo IN ('saida', 'entrada') AND coalesce(invoice_payment, false) = false FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This user’s eligible budget transaction was not found'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.month_check_rows r
    JOIN public.credit_card_invoices i ON i.id = p_invoice_id AND i.user_id = uid
    JOIN public.credit_cards c ON c.id = i.card_id AND c.user_id = uid
    WHERE r.id = p_row_id AND r.user_id = uid AND c.last_four IS NOT NULL
      AND r.invoice_card IS NOT NULL
      AND right(regexp_replace(r.invoice_card, '[^0-9]', '', 'g'), 4) <> c.last_four
  ) THEN RAISE EXCEPTION 'Imported card digits do not match this card'; END IF;
  INSERT INTO public.credit_card_invoice_items(user_id, invoice_id, month_check_row_id)
    VALUES (uid, p_invoice_id, p_row_id);
  RETURN p_row_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlink_credit_card_invoice_row(p_invoice_id uuid, p_row_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  PERFORM 1 FROM public.credit_card_invoices WHERE id = p_invoice_id AND user_id = uid AND closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only an open invoice can be corrected'; END IF;
  DELETE FROM public.credit_card_invoice_items WHERE invoice_id = p_invoice_id AND month_check_row_id = p_row_id AND user_id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Association not found'; END IF;
  RETURN p_row_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_credit_card_payment(
  p_invoice_id uuid, p_account_id uuid, p_effective_date date,
  p_amount_text text, p_idempotency_key uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := auth.uid(); total_value numeric; paid_value numeric; amount_value numeric;
  invoice_currency text; account_currency text; invoice_uuid uuid; payment_uuid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_effective_date IS NULL OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Date and idempotency key are required'; END IF;
  BEGIN amount_value := trim(p_amount_text)::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid payment amount'; END;
  IF amount_value IS NULL OR amount_value <= 0 OR amount_value <> round(amount_value, 2) OR amount_value >= 1000000000000 THEN RAISE EXCEPTION 'Payment must be positive with at most two decimal places'; END IF;

  -- Serialize payment attempts on this invoice before checking the outstanding balance.
  SELECT i.id, i.total_amount, i.currency_code INTO invoice_uuid, total_value, invoice_currency
    FROM public.credit_card_invoices i JOIN public.credit_cards c ON c.id = i.card_id AND c.user_id = i.user_id
    WHERE i.id = p_invoice_id AND i.user_id = uid AND i.closed_at IS NOT NULL FOR UPDATE OF i;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only a closed invoice can be paid'; END IF;
  SELECT id INTO payment_uuid FROM public.credit_card_payments
    WHERE user_id = uid AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF EXISTS (SELECT 1 FROM public.credit_card_payments WHERE id = payment_uuid AND user_id = uid
      AND invoice_id = p_invoice_id AND account_id = p_account_id AND effective_date = p_effective_date AND amount = amount_value) THEN
      RETURN payment_uuid;
    END IF;
    RAISE EXCEPTION 'Idempotency key was already used for a different payment';
  END IF;
  PERFORM 1 FROM public.financial_accounts WHERE id = p_account_id AND user_id = uid AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment account must be active and belong to this user'; END IF;
  SELECT currency_code INTO account_currency FROM public.financial_accounts WHERE id = p_account_id AND user_id = uid;
  IF account_currency <> invoice_currency THEN RAISE EXCEPTION 'Payment account and invoice currencies must match'; END IF;
  SELECT coalesce(sum(amount), 0) INTO paid_value FROM public.credit_card_payments WHERE invoice_id = p_invoice_id AND user_id = uid;
  IF paid_value + amount_value > total_value THEN RAISE EXCEPTION 'Payment exceeds the invoice amount due'; END IF;

  INSERT INTO public.credit_card_payments(user_id, invoice_id, account_id, effective_date, amount, idempotency_key)
  VALUES (uid, p_invoice_id, p_account_id, p_effective_date, amount_value, p_idempotency_key)
  ON CONFLICT (user_id, idempotency_key) DO NOTHING
  RETURNING id INTO payment_uuid;
  IF NOT FOUND THEN
    SELECT id INTO payment_uuid FROM public.credit_card_payments
      WHERE user_id = uid AND idempotency_key = p_idempotency_key;
    IF EXISTS (SELECT 1 FROM public.credit_card_payments WHERE id = payment_uuid AND user_id = uid
      AND invoice_id = p_invoice_id AND account_id = p_account_id AND effective_date = p_effective_date AND amount = amount_value) THEN
      RETURN payment_uuid;
    END IF;
    RAISE EXCEPTION 'Idempotency key was already used for a different payment';
  END IF;
  INSERT INTO public.financial_movements(user_id, account_id, effective_date, movement_type, amount, description, credit_card_payment_id)
  VALUES (uid, p_account_id, p_effective_date, 'expense', amount_value, 'Pagamento de fatura', payment_uuid);
  RETURN payment_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_credit_card_payments(p_invoice_id uuid)
RETURNS TABLE (id uuid, account_id uuid, account_name text, effective_date date, amount text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.credit_card_invoices WHERE id = p_invoice_id AND user_id = uid) THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  RETURN QUERY SELECT p.id, p.account_id, a.name, p.effective_date, p.amount::text, p.created_at
    FROM public.credit_card_payments p JOIN public.financial_accounts a ON a.id = p.account_id AND a.user_id = p.user_id
    WHERE p.invoice_id = p_invoice_id AND p.user_id = uid ORDER BY p.effective_date, p.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_credit_card_payment_movement()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE matching_count integer;
BEGIN
  SELECT count(*) INTO matching_count FROM public.financial_movements m
    WHERE m.credit_card_payment_id = NEW.id AND m.user_id = NEW.user_id
      AND m.account_id = NEW.account_id AND m.effective_date = NEW.effective_date
      AND m.movement_type = 'expense' AND m.amount = NEW.amount;
  IF matching_count <> 1 THEN RAISE EXCEPTION 'Each card payment must have exactly one matching cash movement'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER credit_card_payment_cash_movement
  AFTER INSERT ON public.credit_card_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.validate_credit_card_payment_movement();

REVOKE ALL ON FUNCTION public.list_credit_cards() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_credit_card(uuid, text, text, text, uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_credit_card_active(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_credit_card_invoice(uuid, date, date, date, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_credit_card_invoice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_credit_card_invoice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_credit_card_invoices() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_unlinked_invoice_rows(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_credit_card_invoice_items(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.associate_credit_card_invoice_row(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unlink_credit_card_invoice_row(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_credit_card_payment(uuid, uuid, date, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_credit_card_payments(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_credit_cards() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_credit_card(uuid, text, text, text, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_credit_card_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_credit_card_invoice(uuid, date, date, date, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_credit_card_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_credit_card_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_credit_card_invoices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_unlinked_invoice_rows(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_credit_card_invoice_items(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.associate_credit_card_invoice_row(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_credit_card_invoice_row(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_credit_card_payment(uuid, uuid, date, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_credit_card_payments(uuid) TO authenticated;
