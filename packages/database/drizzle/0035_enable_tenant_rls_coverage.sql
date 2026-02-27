DO $$
DECLARE
  target record;
  policy_name text;
BEGIN
  FOR target IN
    SELECT t.table_name
    FROM information_schema.tables t
    INNER JOIN information_schema.columns c
      ON c.table_schema = t.table_schema
     AND c.table_name = t.table_name
     AND c.column_name = 'tenant_id'
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target.table_name);

    policy_name := format('tenant_isolation_%s', target.table_name);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = target.table_name
        AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I USING (tenant_id = current_setting(''app.current_tenant_id'', true)::text) WITH CHECK (tenant_id = current_setting(''app.current_tenant_id'', true)::text)',
        policy_name,
        target.table_name
      );
    END IF;
  END LOOP;
END
$$;
