DO $$
DECLARE
  read_expr constant text :=
    'coalesce(access_tenant_id, tenant_id) = (select current_setting(''app.current_access_tenant_id'', true))::text';
  write_expr constant text :=
    'tenant_id = (select current_setting(''app.current_access_tenant_id'', true))::text';
  drop_policy_stmt constant text := 'DROP POLICY IF EXISTS %I ON public.%I';
  target record;
BEGIN
  FOR target IN
    SELECT *
    FROM (
      VALUES
        ('claim', 'tenant_isolation_claim', 'claim_access_tenant_id_tenants_id_fk', 'idx_claims_access_tenant'),
        ('claim_documents', 'tenant_isolation_claim_documents', 'claim_documents_access_tenant_id_tenants_id_fk', 'claim_documents_access_tenant_idx'),
        ('claim_escalation_agreements', 'tenant_isolation_claim_escalation_agreements', 'claim_escalation_agreements_access_tenant_id_tenants_id_fk', 'claim_escalation_agreements_access_tenant_idx'),
        ('claim_recovery_no_fee_evidence', 'tenant_isolation_claim_recovery_no_fee_evidence', 'claim_recovery_no_fee_evidence_access_tenant_id_tenants_id_fk', 'claim_recovery_no_fee_evidence_access_tenant_idx'),
        ('domain_events', 'tenant_isolation_domain_events', 'domain_events_access_tenant_id_tenants_id_fk', 'domain_events_access_tenant_idx')
    ) AS t(table_name, read_policy_name, fk_name, index_name)
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS access_tenant_id text', target.table_name);
    EXECUTE format(
      'UPDATE public.%I SET access_tenant_id = tenant_id WHERE access_tenant_id IS NULL',
      target.table_name
    );

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE n.nspname = 'public'
        AND r.relname = target.table_name
        AND c.conname = target.fk_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (access_tenant_id) REFERENCES public.tenants(id)',
        target.table_name,
        target.fk_name
      );
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I USING btree (access_tenant_id)',
      target.index_name,
      target.table_name
    );

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target.table_name);
    EXECUTE format(drop_policy_stmt, target.read_policy_name, target.table_name);
    EXECUTE format(
      drop_policy_stmt,
      format('tenant_write_%s', target.table_name),
      target.table_name
    );
    EXECUTE format(
      drop_policy_stmt,
      format('tenant_update_%s', target.table_name),
      target.table_name
    );
    EXECUTE format(
      drop_policy_stmt,
      format('tenant_delete_%s', target.table_name),
      target.table_name
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (%s)',
      target.read_policy_name,
      target.table_name,
      read_expr
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (%s)',
      format('tenant_write_%s', target.table_name),
      target.table_name,
      write_expr
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',
      format('tenant_update_%s', target.table_name),
      target.table_name,
      write_expr,
      write_expr
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING (%s)',
      format('tenant_delete_%s', target.table_name),
      target.table_name,
      write_expr
    );
  END LOOP;
END;
$$;
