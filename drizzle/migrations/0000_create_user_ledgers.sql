CREATE TABLE public.user_ledgers (
  user_id uuid PRIMARY KEY,
  ledger_data jsonb NOT NULL DEFAULT '{"activeMonthId":"","ledgers":[]}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ledgers TO authenticated;
GRANT ALL ON public.user_ledgers TO service_role;
ALTER TABLE public.user_ledgers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own ledger" ON public.user_ledgers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own ledger" ON public.user_ledgers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own ledger" ON public.user_ledgers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own ledger" ON public.user_ledgers FOR DELETE TO authenticated USING (auth.uid() = user_id);