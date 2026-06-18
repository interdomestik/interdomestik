ALTER TABLE public."domain_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  access_tenant_setting constant text := 'app.current_access_tenant_id';
  domain_events_key text;
  domain_events_expr text;
  target record;
  target_key text;
  target_expr text;
BEGIN
  domain_events_key := CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'domain_events'
        AND c.column_name = 'access_tenant_id'
    ) THEN 'coalesce(access_tenant_id, tenant_id)'
    ELSE 'tenant_id'
  END;
  domain_events_expr := format(
    '%s = (select current_setting(%L, true))::text',
    domain_events_key,
    access_tenant_setting
  );

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'domain_events'
      AND policyname = 'tenant_isolation_domain_events'
  ) THEN
    EXECUTE format(
      'CREATE POLICY "tenant_isolation_domain_events" ON public."domain_events" USING (%s) WITH CHECK (%s)',
      domain_events_expr,
      domain_events_expr
    );
  END IF;
  EXECUTE format(
    'ALTER POLICY "tenant_isolation_domain_events" ON public."domain_events" USING (%s) WITH CHECK (%s)',
    domain_events_expr,
    domain_events_expr
  );

  FOR target IN
    SELECT
      p.tablename,
      p.policyname,
      p.cmd,
      EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = p.schemaname
          AND c.table_name = p.tablename
          AND c.column_name = 'access_tenant_id'
      ) AS has_access_tenant_id
    FROM pg_policies p
    INNER JOIN information_schema.columns tenant_column
      ON tenant_column.table_schema = p.schemaname
     AND tenant_column.table_name = p.tablename
     AND tenant_column.column_name = 'tenant_id'
    WHERE p.schemaname = 'public'
      AND p.policyname = format('tenant_isolation_%s', p.tablename)
      AND p.tablename <> 'domain_events'
    ORDER BY p.tablename
  LOOP
    target_key := CASE
      WHEN target.has_access_tenant_id THEN 'coalesce(access_tenant_id, tenant_id)'
      ELSE 'tenant_id'
    END;
    target_expr := format(
      '%s = (select current_setting(%L, true))::text',
      target_key,
      access_tenant_setting
    );

    IF target.cmd = 'INSERT' THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.%I WITH CHECK (%s)',
        target.policyname,
        target.tablename,
        target_expr
      );
    ELSIF target.cmd IN ('SELECT', 'DELETE') THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.%I USING (%s)',
        target.policyname,
        target.tablename,
        target_expr
      );
    ELSE
      EXECUTE format(
        'ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)',
        target.policyname,
        target.tablename,
        target_expr,
        target_expr
      );
    END IF;
  END LOOP;
END;
$$;
