import { claimDocuments, dbAdmin, user } from '@interdomestik/database';
import type { TestInfo } from '@playwright/test';
import { sql } from 'drizzle-orm';

type ClaimPlanScope = { tenant: string; claimId: string; afterId: string };

/** Capture plans on the same synthetic database and restricted role as the browser. */
export async function attachAdminClaimReadPlans(
  info: TestInfo,
  scopes: readonly ClaimPlanScope[],
  staffSearch: string,
  staffAfter: string
) {
  for (const [index, scope] of scopes.entries()) {
    const plans = await dbAdmin.transaction(async tx => {
      await tx.execute(sql`set local role interdomestik_e2e_runtime`);
      await tx.execute(sql`set local row_security = on`);
      await tx.execute(sql`select set_config('app.current_tenant_id', ${scope.tenant}, true)`);
      await tx.execute(
        sql`select set_config('app.current_access_tenant_id', ${scope.tenant}, true)`
      );
      const [role] = await tx.execute<{ restricted: boolean }>(sql`
        select not rolbypassrls and not rolsuper as restricted
        from pg_roles where rolname = current_user
      `);
      if (role?.restricted !== true) throw new Error('WP-19 plans require restricted RLS');

      // Keep projections and predicates aligned with the bounded domain queries.
      const documentScope = sql`
        (${claimDocuments.accessTenantId} = ${scope.tenant}
        or (${claimDocuments.tenantId} = ${scope.tenant} and ${claimDocuments.accessTenantId} is null))
        and ${claimDocuments.claimId} = ${scope.claimId}
      `;
      const documentPage = (afterId?: string) => sql`
        select id, tenant_id, name, file_size, file_type, created_at, file_path, bucket
        from ${claimDocuments}
        where ${documentScope} ${afterId ? sql`and ${claimDocuments.id} > ${afterId}` : sql.empty()}
        order by id asc limit 26
      `;
      const staff = (afterId?: string) => sql`
        select id, name, email from ${user}
        where ${user.tenantId} = ${scope.tenant} and ${user.role} = 'staff'
        and (${user.name} ilike ${`%${staffSearch}%`} or ${user.email} ilike ${`%${staffSearch}%`})
        ${afterId ? sql`and ${user.id} > ${afterId}` : sql.empty()}
        order by id asc limit 26
      `;
      return {
        documentsFirst: await tx.execute(
          sql`explain (analyze, buffers, format json) ${documentPage()}`
        ),
        documentsContinuation: await tx.execute(
          sql`explain (analyze, buffers, format json) ${documentPage(scope.afterId)}`
        ),
        documentsCount: await tx.execute(sql`
          explain (analyze, buffers, format json) select count(*) from ${claimDocuments} where ${documentScope}
        `),
        staffFirst: await tx.execute(sql`explain (analyze, buffers, format json) ${staff()}`),
        staffContinuation: await tx.execute(
          sql`explain (analyze, buffers, format json) ${staff(staffAfter)}`
        ),
      };
    });
    await info.attach(index === 0 ? 'wp19-null-access-plans' : 'wp19-transfer-plans', {
      body: JSON.stringify(plans),
      contentType: 'application/json',
    });
  }
}
