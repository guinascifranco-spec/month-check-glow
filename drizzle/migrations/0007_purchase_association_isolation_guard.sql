-- Candidate additive migration; test locally before authorized application.
CREATE OR REPLACE FUNCTION public.guard_exclusive_purchase_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.month_check_row_id IS NULL THEN RETURN NEW; END IF;
  IF current_setting('transaction_isolation') NOT IN ('read committed', 'read uncommitted') THEN
    RAISE EXCEPTION 'Purchase associations require READ COMMITTED isolation';
  END IF;
  PERFORM 1 FROM public.month_check_rows
    WHERE id = NEW.month_check_row_id AND user_id = NEW.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Budget purchase not found for this user'; END IF;
  IF TG_TABLE_NAME = 'credit_card_invoice_items' THEN
    IF EXISTS (SELECT 1 FROM public.benefit_wallet_events
      WHERE month_check_row_id = NEW.month_check_row_id AND user_id = NEW.user_id) THEN
      RAISE EXCEPTION 'A budget purchase cannot belong to both a credit card and a benefit wallet';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.credit_card_invoice_items
      WHERE month_check_row_id = NEW.month_check_row_id AND user_id = NEW.user_id) THEN
      RAISE EXCEPTION 'A budget purchase cannot belong to both a credit card and a benefit wallet';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_exclusive_purchase_link() FROM PUBLIC;
