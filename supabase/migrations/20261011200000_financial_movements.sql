-- Cash movements are intentionally separate from month_check_rows (personal budget).
ALTER TABLE public.financial_accounts
  ADD CONSTRAINT financial_accounts_id_user_id_key UNIQUE (id, user_id);

CREATE TABLE public.financial_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  from_account_id uuid NOT NULL,
  to_account_id uuid NOT NULL,
  effective_date date NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_transfers_different_accounts CHECK (from_account_id <> to_account_id),
  CONSTRAINT financial_transfers_from_owner_fk FOREIGN KEY (from_account_id, user_id)
    REFERENCES public.financial_accounts(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT financial_transfers_to_owner_fk FOREIGN KEY (to_account_id, user_id)
    REFERENCES public.financial_accounts(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT financial_transfers_id_user_id_key UNIQUE (id, user_id)
);

CREATE TABLE public.financial_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid NOT NULL,
  effective_date date NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('income', 'expense', 'transfer_in', 'transfer_out')),
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 160),
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  transfer_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_movements_account_owner_fk FOREIGN KEY (account_id, user_id)
    REFERENCES public.financial_accounts(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT financial_movements_transfer_owner_fk FOREIGN KEY (transfer_id, user_id)
    REFERENCES public.financial_transfers(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT financial_movements_transfer_shape CHECK (
    (movement_type IN ('transfer_in', 'transfer_out') AND transfer_id IS NOT NULL AND category_id IS NULL)
    OR (movement_type IN ('income', 'expense') AND transfer_id IS NULL)
  ),
  CONSTRAINT financial_movements_category_shape CHECK (category_id IS NULL OR movement_type = 'expense')
);

CREATE UNIQUE INDEX financial_movements_transfer_leg_unique
  ON public.financial_movements(transfer_id, movement_type)
  WHERE transfer_id IS NOT NULL;
CREATE INDEX financial_movements_owner_date_idx
  ON public.financial_movements(user_id, effective_date DESC);
CREATE INDEX financial_movements_account_date_idx
  ON public.financial_movements(account_id, effective_date DESC);

ALTER TABLE public.financial_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_movements ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.financial_transfers, public.financial_movements TO authenticated;
GRANT ALL ON public.financial_transfers, public.financial_movements TO service_role;

CREATE POLICY "Users select own financial transfers"
  ON public.financial_transfers FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users select own financial movements"
  ON public.financial_movements FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- No direct DML grants or policies: writes go through the validated functions below.

CREATE OR REPLACE FUNCTION public.create_financial_movement(
  p_account_id uuid,
  p_effective_date date,
  p_movement_type text,
  p_amount_text text,
  p_description text,
  p_category_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := auth.uid();
  amount_value numeric;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_movement_type NOT IN ('income', 'expense') THEN RAISE EXCEPTION 'Invalid movement type'; END IF;
  IF p_effective_date IS NULL THEN RAISE EXCEPTION 'Effective date is required'; END IF;
  IF p_description IS NULL OR length(trim(p_description)) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid description'; END IF;
  BEGIN amount_value := trim(p_amount_text)::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid amount'; END;
  IF amount_value IS NULL OR amount_value <= 0 OR amount_value <> round(amount_value, 2) OR amount_value >= 1000000000000 THEN
    RAISE EXCEPTION 'Amount must be positive and have at most two decimal places';
  END IF;

  PERFORM 1 FROM public.financial_accounts
    WHERE id = p_account_id AND user_id = uid AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active account not found'; END IF;
  IF p_category_id IS NOT NULL THEN
    IF p_movement_type <> 'expense' OR NOT EXISTS (
      SELECT 1 FROM public.expense_categories WHERE id = p_category_id AND user_id = uid
    ) THEN RAISE EXCEPTION 'Category not found for this user'; END IF;
  END IF;

  INSERT INTO public.financial_movements(user_id, account_id, effective_date, movement_type, amount, description, category_id)
  VALUES (uid, p_account_id, p_effective_date, p_movement_type, amount_value, trim(p_description), p_category_id)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_financial_movement(
  p_id uuid,
  p_account_id uuid,
  p_effective_date date,
  p_movement_type text,
  p_amount_text text,
  p_description text,
  p_category_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := auth.uid();
  amount_value numeric;
  old_account_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_movement_type NOT IN ('income', 'expense') THEN RAISE EXCEPTION 'Invalid movement type'; END IF;
  IF p_effective_date IS NULL THEN RAISE EXCEPTION 'Effective date is required'; END IF;
  IF p_description IS NULL OR length(trim(p_description)) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid description'; END IF;
  BEGIN amount_value := trim(p_amount_text)::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid amount'; END;
  IF amount_value IS NULL OR amount_value <= 0 OR amount_value <> round(amount_value, 2) OR amount_value >= 1000000000000 THEN
    RAISE EXCEPTION 'Amount must be positive and have at most two decimal places';
  END IF;
  SELECT account_id INTO old_account_id FROM public.financial_movements
    WHERE id = p_id AND user_id = uid AND transfer_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Editable movement not found';
  END IF;
  PERFORM 1 FROM public.financial_accounts
    WHERE id = p_account_id AND user_id = uid AND (is_active OR p_account_id = old_account_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active account not found'; END IF;
  IF p_category_id IS NOT NULL AND (
    p_movement_type <> 'expense' OR NOT EXISTS (
      SELECT 1 FROM public.expense_categories WHERE id = p_category_id AND user_id = uid
    )
  ) THEN RAISE EXCEPTION 'Category not found for this user'; END IF;

  UPDATE public.financial_movements
  SET account_id = p_account_id, effective_date = p_effective_date, movement_type = p_movement_type,
      amount = amount_value, description = trim(p_description), category_id = p_category_id, updated_at = now()
  WHERE id = p_id AND user_id = uid AND transfer_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer legs cannot be edited independently'; END IF;
  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_financial_movement(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  DELETE FROM public.financial_movements
    WHERE id = p_id AND user_id = uid AND transfer_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movement not found or belongs to a transfer'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_financial_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_effective_date date,
  p_amount_text text,
  p_description text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := auth.uid();
  amount_value numeric;
  source_currency text;
  target_currency text;
  transfer_uuid uuid;
  lock_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_from_account_id = p_to_account_id THEN RAISE EXCEPTION 'Choose two different accounts'; END IF;
  IF p_effective_date IS NULL THEN RAISE EXCEPTION 'Effective date is required'; END IF;
  IF p_description IS NULL OR length(trim(p_description)) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid description'; END IF;
  BEGIN amount_value := trim(p_amount_text)::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid amount'; END;
  IF amount_value IS NULL OR amount_value <= 0 OR amount_value <> round(amount_value, 2) OR amount_value >= 1000000000000 THEN
    RAISE EXCEPTION 'Amount must be positive and have at most two decimal places';
  END IF;

  -- Stable lock order prevents deadlocks for simultaneous transfers in opposite directions.
  FOR lock_id IN SELECT unnest(ARRAY[p_from_account_id, p_to_account_id]) ORDER BY 1 LOOP
    PERFORM 1 FROM public.financial_accounts WHERE id = lock_id AND user_id = uid AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Both accounts must belong to this user and be active'; END IF;
  END LOOP;
  SELECT currency_code INTO source_currency FROM public.financial_accounts WHERE id = p_from_account_id AND user_id = uid;
  SELECT currency_code INTO target_currency FROM public.financial_accounts WHERE id = p_to_account_id AND user_id = uid;
  IF source_currency <> target_currency THEN RAISE EXCEPTION 'Transfers between different currencies are not supported'; END IF;

  INSERT INTO public.financial_transfers(user_id, from_account_id, to_account_id, effective_date, amount, description)
  VALUES (uid, p_from_account_id, p_to_account_id, p_effective_date, amount_value, trim(p_description))
  RETURNING id INTO transfer_uuid;
  INSERT INTO public.financial_movements(user_id, account_id, effective_date, movement_type, amount, description, transfer_id)
  VALUES
    (uid, p_from_account_id, p_effective_date, 'transfer_out', amount_value, trim(p_description), transfer_uuid),
    (uid, p_to_account_id, p_effective_date, 'transfer_in', amount_value, trim(p_description), transfer_uuid);
  RETURN transfer_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_financial_transfer(p_transfer_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.financial_transfers SET status = 'cancelled', updated_at = now()
    WHERE id = p_transfer_id AND user_id = uid AND status = 'completed';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active transfer not found'; END IF;
  RETURN p_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.financial_account_balances(p_as_of_date date)
RETURNS TABLE (
  account_id uuid,
  currency_code text,
  is_active boolean,
  opening_balance text,
  opening_balance_date date,
  recorded_net_activity text,
  calculated_balance text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.id, a.currency_code, a.is_active, a.opening_balance::text, a.opening_balance_date,
    coalesce(sum(CASE m.movement_type
      WHEN 'income' THEN m.amount
      WHEN 'expense' THEN -m.amount
      WHEN 'transfer_in' THEN m.amount
      WHEN 'transfer_out' THEN -m.amount
      ELSE 0 END) FILTER (
        WHERE m.id IS NOT NULL
          AND m.effective_date <= p_as_of_date
          AND (a.opening_balance_date IS NULL OR m.effective_date > a.opening_balance_date)
          AND (m.transfer_id IS NULL OR t.status = 'completed')
      ), 0)::text,
    CASE WHEN a.opening_balance IS NULL OR a.opening_balance_date > p_as_of_date THEN NULL ELSE
      (a.opening_balance + coalesce(sum(CASE m.movement_type
        WHEN 'income' THEN m.amount
        WHEN 'expense' THEN -m.amount
        WHEN 'transfer_in' THEN m.amount
        WHEN 'transfer_out' THEN -m.amount
        ELSE 0 END) FILTER (
          WHERE m.id IS NOT NULL AND m.effective_date <= p_as_of_date AND m.effective_date > a.opening_balance_date
            AND (m.transfer_id IS NULL OR t.status = 'completed')
        ), 0))::text END
  FROM public.financial_accounts a
  LEFT JOIN public.financial_movements m ON m.account_id = a.id AND m.user_id = a.user_id
  LEFT JOIN public.financial_transfers t ON t.id = m.transfer_id AND t.user_id = m.user_id
  WHERE a.user_id = auth.uid()
  GROUP BY a.id
$$;

CREATE OR REPLACE FUNCTION public.list_financial_movements(
  p_from_date date,
  p_to_date date,
  p_account_id uuid DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  account_id uuid,
  account_name text,
  related_account_name text,
  effective_date date,
  movement_type text,
  amount text,
  description text,
  category_id uuid,
  category_name text,
  transfer_id uuid,
  transfer_status text,
  created_at timestamptz
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
      CASE WHEN t.id IS NOT NULL THEN t.description ELSE m.description END,
      m.category_id, c.name, m.transfer_id, t.status, m.created_at
    FROM public.financial_movements m
    JOIN public.financial_accounts a ON a.id = m.account_id AND a.user_id = m.user_id
    LEFT JOIN public.financial_transfers t ON t.id = m.transfer_id AND t.user_id = m.user_id
    LEFT JOIN public.financial_accounts source ON source.id = t.from_account_id AND source.user_id = t.user_id
    LEFT JOIN public.financial_accounts target ON target.id = t.to_account_id AND target.user_id = t.user_id
    LEFT JOIN public.expense_categories c ON c.id = m.category_id AND c.user_id = m.user_id
    WHERE m.user_id = uid AND m.effective_date BETWEEN p_from_date AND p_to_date
      AND (p_account_id IS NULL OR m.account_id = p_account_id)
    ORDER BY m.effective_date DESC, m.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_financial_movement_categories()
RETURNS TABLE (id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id, c.name FROM public.expense_categories c
  WHERE c.user_id = auth.uid() ORDER BY c.name
$$;

-- Deferred check ensures every committed transfer has exactly one leg in each direction.
CREATE OR REPLACE FUNCTION public.validate_financial_transfer_legs()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE outgoing_count integer; incoming_count integer; invalid_legs integer;
BEGIN
  SELECT count(*) FILTER (WHERE movement_type = 'transfer_out'),
         count(*) FILTER (WHERE movement_type = 'transfer_in')
    INTO outgoing_count, incoming_count
  FROM public.financial_movements WHERE transfer_id = NEW.id AND user_id = NEW.user_id;
  IF outgoing_count <> 1 OR incoming_count <> 1 THEN
    RAISE EXCEPTION 'A transfer must have exactly one outgoing and one incoming movement';
  END IF;
  SELECT count(*) INTO invalid_legs
  FROM public.financial_movements m
  JOIN public.financial_transfers t ON t.id = m.transfer_id AND t.user_id = m.user_id
  WHERE t.id = NEW.id AND t.user_id = NEW.user_id
    AND (
      (m.movement_type = 'transfer_out' AND (m.account_id <> t.from_account_id OR m.amount <> t.amount OR m.effective_date <> t.effective_date))
      OR (m.movement_type = 'transfer_in' AND (m.account_id <> t.to_account_id OR m.amount <> t.amount OR m.effective_date <> t.effective_date))
    );
  IF invalid_legs <> 0 THEN RAISE EXCEPTION 'Transfer movement legs do not match their transfer record'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER financial_transfers_two_legs
  AFTER INSERT OR UPDATE ON public.financial_transfers
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.validate_financial_transfer_legs();

REVOKE ALL ON FUNCTION public.create_financial_movement(uuid, date, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_financial_movement(uuid, uuid, date, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_financial_movement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_financial_transfer(uuid, uuid, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_financial_transfer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.financial_account_balances(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_financial_movements(date, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_financial_movement_categories() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_financial_movement(uuid, date, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_financial_movement(uuid, uuid, date, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_financial_movement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_financial_transfer(uuid, uuid, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_financial_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.financial_account_balances(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_financial_movements(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_financial_movement_categories() TO authenticated;
