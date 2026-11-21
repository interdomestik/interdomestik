import type { TenantTransaction } from '@interdomestik/database';
import {
  legalEntities,
  membershipPlans,
  membershipPlanVersions,
} from '@interdomestik/database/schema';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ROLES } from '@interdomestik/shared-auth';
import { desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { matchesSaleActor, sessionPrincipal, type SaleActor } from './sale-authority';
import { publishPlanVersionInputSchema, withdrawPlanVersionInputSchema } from './sale-input';

export function hasLegalTerms(value: typeof legalEntities.$inferSelect | null | undefined) {
  return value?.isActive && present(value.governingLaw) && present(value.termsVersion);
}

function present(value: string | null): boolean {
  return value !== null && /[^ \t\r\n]/u.test(value);
}

export async function lockPlan(
  tx: TenantTransaction,
  tenantId: string,
  planId: string,
  mode: 'share' | 'update'
) {
  const [plan] = await tx
    .select()
    .from(membershipPlans)
    .where(withTenant(tenantId, membershipPlans.tenantId, eq(membershipPlans.id, planId)))
    .for(mode);
  return plan;
}

export async function lockLegalEntity(tx: TenantTransaction, tenantId: string, entityId: string) {
  const [entity] = await tx
    .select()
    .from(legalEntities)
    .where(withTenant(tenantId, legalEntities.tenantId, eq(legalEntities.id, entityId)))
    .for('share');
  return entity;
}

export async function publishPlanVersion(
  authority: TenantAuthority,
  input: unknown,
  actor: SaleActor
) {
  const principal = sessionPrincipal(authority, [ROLES.tenant_admin]);
  if (!principal || !matchesSaleActor(principal, actor))
    return { ok: false, code: 'forbidden' } as const;
  const parsed = publishPlanVersionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid' } as const;
  const { tenantId, userId } = principal;
  const { planId, legalEntityId } = parsed.data;

  return withTenantAuthority(authority, async tx => {
    const plan = await lockPlan(tx, tenantId, planId, 'update');
    if (
      !plan?.isActive ||
      plan.tier === 'family' ||
      plan.interval !== 'year' ||
      plan.currency !== 'EUR' ||
      !/^\d+\.\d{2}$/u.test(plan.price)
    ) {
      return { ok: false, code: 'invalid' } as const;
    }
    const listPriceMinor = BigInt(plan.price.replace('.', ''));
    if (
      listPriceMinor <= 0n ||
      !hasLegalTerms(await lockLegalEntity(tx, tenantId, legalEntityId))
    ) {
      return { ok: false, code: 'invalid' } as const;
    }

    const [last] = await tx
      .select({ version: membershipPlanVersions.version })
      .from(membershipPlanVersions)
      .where(
        withTenant(
          tenantId,
          membershipPlanVersions.tenantId,
          eq(membershipPlanVersions.planId, planId)
        )
      )
      .orderBy(desc(membershipPlanVersions.version))
      .limit(1);

    const [version] = await tx
      .insert(membershipPlanVersions)
      .values({
        id: randomUUID(),
        planId,
        legalEntityId,
        version: (last?.version ?? 0) + 1,
        tier: plan.tier,
        interval: plan.interval,
        membersIncluded: plan.membersIncluded,
        listPriceMinor,
        priceCurrency: plan.currency,
        publishedAt: sql`null`,
        tenantId,
        publishedBy: userId,
      })
      .returning();
    return { ok: true, version } as const;
  });
}

export async function withdrawPlanVersion(
  authority: TenantAuthority,
  input: unknown,
  actor: SaleActor
) {
  const principal = sessionPrincipal(authority, [ROLES.tenant_admin]);
  if (!principal || !matchesSaleActor(principal, actor))
    return { ok: false, code: 'forbidden' } as const;
  const parsed = withdrawPlanVersionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid' } as const;
  const { tenantId, userId } = principal;
  const { planVersionId } = parsed.data;

  return withTenantAuthority(authority, async tx => {
    const scope = withTenant(
      tenantId,
      membershipPlanVersions.tenantId,
      eq(membershipPlanVersions.id, planVersionId)
    );
    const [target] = await tx
      .select({ planId: membershipPlanVersions.planId })
      .from(membershipPlanVersions)
      .where(scope);
    if (!target) return { ok: false, code: 'not_found' } as const;
    await lockPlan(tx, tenantId, target.planId, 'update');

    const [version] = await tx.select().from(membershipPlanVersions).where(scope).for('update');
    if (!version) return { ok: false, code: 'not_found' } as const;
    if (version.withdrawnAt !== null) return { ok: true, version } as const;

    const [withdrawn] = await tx
      .update(membershipPlanVersions)
      .set({ withdrawnAt: sql`clock_timestamp()`, withdrawnBy: userId })
      .where(scope)
      .returning();
    return { ok: true, version: withdrawn } as const;
  });
}
