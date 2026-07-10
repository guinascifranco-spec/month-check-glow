DROP POLICY "Users select own rows" ON public.month_check_rows;
DROP POLICY "Users insert own rows" ON public.month_check_rows;
DROP POLICY "Users update own rows" ON public.month_check_rows;
DROP POLICY "Users delete own rows" ON public.month_check_rows;

CREATE POLICY "Users select own rows" ON public.month_check_rows FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own rows" ON public.month_check_rows FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own rows" ON public.month_check_rows FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own rows" ON public.month_check_rows FOR DELETE TO authenticated USING (auth.uid() = user_id);