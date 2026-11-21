import type { TenantTransaction } from '@interdomestik/database';
import {
  exchangeRates,
  legalEntities,
  membershipPlans,
  membershipPlanVersions,
  user,
} from '@interdomestik/database/schema';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { toMkdMinor } from './money';
import { hasLegalTerms } from './plan-versions';
import {
  matchesSaleActor,
  saleRoles,
  sessionPrincipal,
  type SaleActor,
  type SalePrincipal,
} from './sale-authority';
import { getSaleOfferInputSchema } from './sale-input';

export async function readSaleOffer(
  tx: TenantTransaction,
  principal: SalePrincipal,
  planId: string
) {
  const { tenantId, userId } = principal;
  const current = tx
    .select()
    .from(membershipPlanVersions)
    .where(
      withTenant(
        tenantId,
        membershipPlanVersions.tenantId,
        and(
          eq(membershipPlanVersions.planId, membershipPlans.id),
          isNull(membershipPlanVersions.withdrawnAt)
        )
      )
    )
    .orderBy(desc(membershipPlanVersions.version))
    .limit(1)
    .as('current_offer');

  const rateInForce = tx
    .select()
    .from(exchangeRates)
    .where(
      withTenant(
        tenantId,
        exchangeRates.tenantId,
        sql`${exchangeRates.storedAt} <= statement_timestamp()
      and ${exchangeRates.effectiveOn} <= (statement_timestamp() at time zone 'Europe/Skopje')::date`
      )
    )
    .orderBy(desc(exchangeRates.effectiveOn), desc(exchangeRates.revision))
    .limit(1)
    .as('rate_in_force');

  const [snapshot] = await tx
    .select({
      planId: membershipPlans.id,
      active: membershipPlans.isActive,
      version: {
        id: current.id,
        planId: current.planId,
        legalEntityId: current.legalEntityId,
        tier: current.tier,
        membersIncluded: current.membersIncluded,
        listPriceMinor: current.listPriceMinor,
        priceCurrency: current.priceCurrency,
      },
      entity: legalEntities,
      rate: {
        id: rateInForce.id,
        bookId: rateInForce.bookId,
        rate: rateInForce.rate,
        base: rateInForce.base,
        quote: rateInForce.quote,
        effectiveOn: rateInForce.effectiveOn,
      },
    })
    .from(user)
    .leftJoin(
      membershipPlans,
      withTenant(tenantId, membershipPlans.tenantId, eq(membershipPlans.id, planId))
    )
    .leftJoinLateral(current, sql`true`)
    .leftJoin(
      legalEntities,
      withTenant(tenantId, legalEntities.tenantId, eq(legalEntities.id, current.legalEntityId))
    )
    .leftJoinLateral(rateInForce, sql`true`)
    .where(withTenant(tenantId, user.tenantId, eq(user.id, userId)));

  if (!snapshot) return { ok: false, code: 'forbidden' } as const;
  if (!snapshot.planId) return { ok: false, code: 'not_found' } as const;
  const { active, version, entity, rate } = snapshot;
  if (
    !active ||
    !version ||
    !entity?.governingLaw ||
    !entity.termsVersion ||
    !hasLegalTerms(entity) ||
    (version.tier !== 'basic' && version.tier !== 'standard') ||
    version.membersIncluded !== 1
  ) {
    return { ok: false, code: 'stale_offer' } as const;
  }
  return {
    ok: true,
    version,
    rate,
    governingLaw: entity.governingLaw,
    termsVersion: entity.termsVersion,
  } as const;
}

export async function getSaleOffer(authority: TenantAuthority, input: unknown, actor?: SaleActor) {
  const principal = sessionPrincipal(authority, saleRoles);
  if (!principal || (actor && !matchesSaleActor(principal, actor))) {
    return { ok: false, code: 'forbidden' } as const;
  }
  const parsed = getSaleOfferInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid' } as const;
  return withTenantAuthority(authority, async tx => {
    const result = await readSaleOffer(tx, principal, parsed.data.planId);
    if (!result.ok) return result;
    const { version, rate, termsVersion } = result;
    if (!rate) return { ok: false, code: 'rate_unavailable' } as const;
    const amountMkdMinor = toMkdMinor(version.listPriceMinor, rate.rate);
    if (amountMkdMinor <= 0n) return { ok: false, code: 'rate_unavailable' } as const;
    return {
      ok: true,
      offer: {
        planVersionId: version.id,
        listPriceMinor: version.listPriceMinor,
        priceCurrency: version.priceCurrency,
        legalEntityId: version.legalEntityId,
        termsVersion,
        rateId: rate.id,
        rateEffectiveOn: rate.effectiveOn,
        amountMkdMinor,
      },
    } as const;
  });
}
