ALTER TABLE public."domain_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  access_tenant_setting constant text := 'app.current_access_tenant_id';
  access_tenant_id_column constant text := 'access_tenant_id';
  access_tenant_key_expr constant text := 'coalesce(access_tenant_id, tenant_id)';
  domain_events_policy constant text := 'tenant_isolation_domain_events';
  domain_events_table constant text := 'domain_events';
  public_schema constant text := 'public';
  tenant_id_column constant text := 'tenant_id';
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
      WHERE c.table_schema = public_schema
        AND c.table_name = domain_events_table
        AND c.column_name = access_tenant_id_column
    ) THEN access_tenant_key_expr
    ELSE tenant_id_column
  END;
  domain_events_expr := format(
    '%s = (select current_setting(%L, true))::text',
    domain_events_key,
    access_tenant_setting
  );

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = public_schema
      AND tablename = domain_events_table
      AND policyname = domain_events_policy
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON public."domain_events" USING (%s) WITH CHECK (%s)',
      domain_events_policy,
      domain_events_expr,
      domain_events_expr
    );
  END IF;
  EXECUTE format(
    'ALTER POLICY %I ON public."domain_events" USING (%s) WITH CHECK (%s)',
    domain_events_policy,
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
          AND c.column_name = access_tenant_id_column
      ) AS has_access_tenant_id
    FROM pg_policies p
    INNER JOIN information_schema.columns tenant_column
      ON tenant_column.table_schema = p.schemaname
     AND tenant_column.table_name = p.tablename
     AND tenant_column.column_name = tenant_id_column
    WHERE p.schemaname = public_schema
      AND p.policyname = format('tenant_isolation_%s', p.tablename)
      AND p.tablename <> domain_events_table
    ORDER BY p.tablename
  LOOP
    target_key := CASE
      WHEN target.has_access_tenant_id THEN access_tenant_key_expr
      ELSE tenant_id_column
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
