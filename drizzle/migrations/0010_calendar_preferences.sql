CREATE TABLE public.calendar_preferences (
  user_id uuid PRIMARY KEY,
  reserved_amount numeric NOT NULL DEFAULT 0 CHECK (reserved_amount >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.calendar_preferences TO authenticated;
GRANT ALL ON public.calendar_preferences TO service_role;
ALTER TABLE public.calendar_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own select" ON public.calendar_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own insert" ON public.calendar_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own update" ON public.calendar_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);