ALTER TABLE public.month_check_rows ADD COLUMN invoice_responsibility text, ADD COLUMN invoice_personal_value numeric, ADD COLUMN invoice_payment boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.month_check_rows.invoice_responsibility IS 'Human-reviewed invoice responsibility: own, shared, bia, reimbursable; null preserves legacy behavior.';
COMMENT ON COLUMN public.month_check_rows.invoice_personal_value IS 'Personal portion; valor remains full invoice amount for reconciliation and duplicate matching.';
CREATE OR REPLACE FUNCTION public.validate_invoice_responsibility() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF NEW.invoice_payment THEN
  IF NEW.tipo <> 'saida' OR NEW.invoice_source IS NOT NULL OR NEW.invoice_responsibility IS NOT NULL OR NEW.invoice_personal_value IS NOT NULL THEN RAISE EXCEPTION 'Pagamento de fatura deve ser uma saída manual sem classificação de compra.'; END IF;
 ELSIF NEW.invoice_responsibility IS NULL THEN
  IF NEW.invoice_personal_value IS NOT NULL THEN RAISE EXCEPTION 'Informe a classificação do lançamento.'; END IF;
 ELSE
  IF NEW.invoice_source IS NULL OR NEW.invoice_responsibility NOT IN ('own','shared','bia','reimbursable') OR NEW.valor < 0 OR NEW.valor <> round(NEW.valor,2) THEN RAISE EXCEPTION 'Classificação de fatura inválida.'; END IF;
  IF NEW.invoice_responsibility='own' THEN NEW.invoice_personal_value := NEW.valor;
  ELSIF NEW.invoice_responsibility IN ('bia','reimbursable') THEN NEW.invoice_personal_value := 0;
  ELSIF NEW.invoice_personal_value IS NULL OR NEW.invoice_personal_value < 0 OR NEW.invoice_personal_value > NEW.valor OR NEW.invoice_personal_value <> round(NEW.invoice_personal_value,2) THEN RAISE EXCEPTION 'Minha parte deve estar entre zero e o valor integral, com até duas casas decimais.';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER validate_invoice_responsibility BEFORE INSERT OR UPDATE ON public.month_check_rows FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_responsibility();
CREATE OR REPLACE FUNCTION public.import_invoice_rows(p_source text, p_card text, p_rows jsonb, p_dry_run boolean DEFAULT true, p_acknowledge boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r jsonb; existing record; inserted_count int := 0; skipped_count int := 0; dupes jsonb := '[]'; pending jsonb := '[]'; seen jsonb := '[]'; signature text; normalized text; is_exact boolean; line_no int; v_date date; v_value numeric; v_category uuid; v_current int; v_total int; v_type text; v_description text; v_position int; v_responsibility text; v_personal numeric; seen_lines jsonb := '[]';
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Não autorizado'; END IF;
 IF p_source IS NULL OR p_source !~ '^[a-f0-9]{64}$' OR p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 OR length(coalesce(p_card,'')) > 24 THEN RAISE EXCEPTION 'Importação inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 739));
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  line_no := (r->>'line')::int; v_date := (r->>'date')::date; v_value := (r->>'value')::numeric; v_category := nullif(r->>'categoryId','')::uuid; v_current := (r->>'current')::int; v_total := (r->>'total')::int; v_type := r->>'type'; v_description := btrim(r->>'description'); v_responsibility := r->>'responsibility'; v_personal := (r->>'personalValue')::numeric;
  IF line_no IS NULL OR line_no NOT BETWEEN 0 AND 499 OR v_date IS NULL OR extract(year FROM v_date) NOT BETWEEN 1970 AND 3000 OR v_value IS NULL OR v_value < 0 OR v_value > 999999999 OR v_value <> round(v_value,2) OR v_type IS NULL OR v_type NOT IN ('entrada','saida') OR coalesce(length(v_description),0) NOT BETWEEN 1 AND 160 OR ((v_current IS NOT NULL OR v_total IS NOT NULL) AND (v_current IS NULL OR v_total IS NULL OR v_current < 1 OR v_total < v_current OR v_total > 360)) THEN RAISE EXCEPTION 'Revise data, descrição, valor e parcelas dos lançamentos.'; END IF;
  IF seen_lines ? line_no::text THEN RAISE EXCEPTION 'Linhas repetidas'; END IF; seen_lines := seen_lines || jsonb_build_array(line_no::text);
  IF v_responsibility IS NULL THEN
   IF v_personal IS NOT NULL THEN RAISE EXCEPTION 'Classificação inválida'; END IF;
  ELSE
   IF v_responsibility NOT IN ('own','shared','bia','reimbursable') OR v_personal IS NULL OR v_personal < 0 OR v_personal > v_value OR v_personal <> round(v_personal,2) OR (v_responsibility='own' AND v_personal<>v_value) OR (v_responsibility IN ('bia','reimbursable') AND v_personal<>0) THEN RAISE EXCEPTION 'Revise a classificação e minha parte.'; END IF;
  END IF;
  IF v_category IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.expense_categories WHERE id=v_category AND user_id=uid) THEN RAISE EXCEPTION 'Categoria inválida ou indisponível'; END IF;
  IF EXISTS (SELECT 1 FROM public.month_check_rows WHERE user_id=uid AND invoice_source=p_source AND invoice_line=line_no) THEN
   dupes := dupes || jsonb_build_array(jsonb_build_object('line',line_no,'exact',true,'description',v_description,'date',v_date,'value',v_value,'reason','Esta linha já foi importada.')); skipped_count := skipped_count+1; CONTINUE;
  END IF;
  normalized := regexp_replace(lower(v_description), '[^[:alnum:]]', '', 'g'); signature := v_date::text || ':' || v_value::text || ':' || v_type || ':' || normalized; is_exact := false;
  FOR existing IN SELECT descricao, coalesce(transaction_date, make_date(year,month,1)) AS date, valor, invoice_source, invoice_card FROM public.month_check_rows WHERE user_id=uid AND NOT invoice_payment AND tipo=v_type AND round(valor,2)=v_value AND coalesce(transaction_date,make_date(year,month,1)) BETWEEN v_date-3 AND v_date+3 LOOP
   IF existing.date=v_date AND regexp_replace(lower(existing.descricao),'[^[:alnum:]]','','g')=normalized THEN
    is_exact := true; dupes := dupes || jsonb_build_array(jsonb_build_object('line',line_no,'exact',true,'description',existing.descricao,'date',existing.date,'value',existing.valor,'reason','Data, descrição e valor iguais a um lançamento existente.')); EXIT;
   ELSIF existing.date=v_date OR regexp_replace(lower(existing.descricao),'[^[:alnum:]]','','g')=normalized OR (p_card IS NOT NULL AND existing.invoice_card=p_card) THEN
    dupes := dupes || jsonb_build_array(jsonb_build_object('line',line_no,'exact',false,'description',existing.descricao,'date',existing.date,'value',existing.valor,'reason','Possível duplicidade: valor e data ou descrição semelhantes.'));
   END IF;
  END LOOP;
  IF seen ? signature THEN dupes := dupes || jsonb_build_array(jsonb_build_object('line',line_no,'exact',false,'description',v_description,'date',v_date,'value',v_value,'reason','Linha semelhante nesta mesma importação.')); END IF;
  seen := seen || jsonb_build_array(signature);
  IF is_exact THEN skipped_count := skipped_count+1; ELSE pending := pending || jsonb_build_array(r); END IF;
 END LOOP;
 IF p_dry_run OR (jsonb_array_length(dupes)>0 AND NOT p_acknowledge) THEN RETURN jsonb_build_object('imported',0,'skipped',skipped_count,'count',jsonb_array_length(pending),'duplicates',dupes,'needsReview',NOT p_dry_run); END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(pending) LOOP
  v_date := (r->>'date')::date;
  SELECT coalesce(max(position),-1)+1 INTO v_position FROM public.month_check_rows WHERE user_id=uid AND year=extract(year FROM v_date)::int AND month=extract(month FROM v_date)::int;
  INSERT INTO public.month_check_rows(user_id,year,month,transaction_date,descricao,tipo,valor,category_id,expense_class,quitado,position,invoice_source,invoice_line,invoice_card,invoice_installment_current,invoice_installment_total,invoice_responsibility,invoice_personal_value)
  VALUES(uid,extract(year FROM v_date)::int,extract(month FROM v_date)::int,v_date,btrim(r->>'description'),r->>'type',(r->>'value')::numeric,nullif(r->>'categoryId','')::uuid,'variavel',false,v_position,p_source,(r->>'line')::int,p_card,(r->>'current')::int,(r->>'total')::int,r->>'responsibility',(r->>'personalValue')::numeric);
  inserted_count := inserted_count+1;
 END LOOP;
 RETURN jsonb_build_object('imported',inserted_count,'skipped',skipped_count,'count',jsonb_array_length(pending),'duplicates',dupes,'needsReview',false);
END; $$;
REVOKE ALL ON FUNCTION public.import_invoice_rows(text,text,jsonb,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_invoice_rows(text,text,jsonb,boolean,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.validate_invoice_responsibility() FROM PUBLIC, anon;
