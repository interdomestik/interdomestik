import { sql } from 'drizzle-orm';

export async function refreshCaseScopedGrantPolicies(adminDb: {
  execute(query: unknown): Promise<unknown>;
}): Promise<void> {
  await adminDb.execute(
    sql.raw(`
    drop policy if exists "tenant_isolation_case_scoped_access_grants" on public."case_scoped_access_grants";
    drop policy if exists "tenant_write_case_scoped_access_grants" on public."case_scoped_access_grants";
    drop policy if exists "tenant_update_case_scoped_access_grants" on public."case_scoped_access_grants";
    drop policy if exists "tenant_delete_case_scoped_access_grants" on public."case_scoped_access_grants";
    create policy "tenant_isolation_case_scoped_access_grants"
      on public."case_scoped_access_grants"
      for select
      using (
        tenant_id = (select current_setting('app.current_access_tenant_id', true))::text
        or access_tenant_id = (select current_setting('app.current_access_tenant_id', true))::text
      );
    create policy "tenant_write_case_scoped_access_grants"
      on public."case_scoped_access_grants"
      for insert
      with check (tenant_id = (select current_setting('app.current_access_tenant_id', true))::text);
    create policy "tenant_update_case_scoped_access_grants"
      on public."case_scoped_access_grants"
      for update
      using (tenant_id = (select current_setting('app.current_access_tenant_id', true))::text)
      with check (tenant_id = (select current_setting('app.current_access_tenant_id', true))::text);
    create policy "tenant_delete_case_scoped_access_grants"
      on public."case_scoped_access_grants"
      for delete
      using (tenant_id = (select current_setting('app.current_access_tenant_id', true))::text);
  `)
  );
}
