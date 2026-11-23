import type { TenantTransaction } from '@interdomestik/database';
import { membershipSaleClaims, membershipSales } from '@interdomestik/database/schema';
import { withTenant } from '@interdomestik/database/tenant-security';
import { eq, sql } from 'drizzle-orm';

import type { SalePrincipal } from './sale-authority';
import { findScopedBuyer, type SaleBuyer } from './sale-buyers';
import type { SaleInput } from './sale-input';

export function saleHash(input: SaleInput, buyer: SaleBuyer) {
  return sql<string>`public.membership_individual_sale_hash(
    ${buyer.kind}, ${buyer.id}, ${input.planVersionId}, ${input.termsVersion},
    ${input.rateId}, ${input.amountMkdMinor.toString()}::bigint, ${input.channel}
  )`;
}

export async function claimSale(
  tx: TenantTransaction,
  tenantId: string,
  operationKey: string,
  hash: ReturnType<typeof saleHash>
) {
  const [claim] = await tx
    .insert(membershipSaleClaims)
    .values({
      operationKey,
      requestHash: hash,
      claimedAt: sql`clock_timestamp()`,
      tenantId,
    })
    .onConflictDoNothing({
      target: [membershipSaleClaims.tenantId, membershipSaleClaims.operationKey],
    })
    .returning({ requestHash: membershipSaleClaims.requestHash });
  return claim;
}

type SaleRow = typeof membershipSales.$inferSelect;

export function saleResult({ requestHash: _, ...sale }: SaleRow) {
  return { ok: true, sale } as const;
}

function saleBuyer(row: SaleRow): SaleBuyer | null {
  if (row.buyerKind === 'lead' && row.leadId) return { kind: 'lead', id: row.leadId };
  if (row.buyerKind === 'member' && row.memberUserId)
    return { kind: 'member', id: row.memberUserId };
  return null;
}

export async function replaySale(
  tx: TenantTransaction,
  principal: SalePrincipal,
  operationKey: string,
  hash: ReturnType<typeof saleHash>
) {
  // The INSERT's snapshot may predate the winner's commit. Read again after it returns.
  const scope = withTenant(
    principal.tenantId,
    membershipSales.tenantId,
    eq(membershipSales.operationKey, operationKey)
  );
  const [sale] = await tx.select().from(membershipSales).where(scope);
  const buyer = sale && saleBuyer(sale);
  if (!buyer || !(await findScopedBuyer(tx, principal, buyer, true))) {
    return { ok: false, code: 'not_found' } as const;
  }

  const [result] = await tx
    .select({ matches: sql<boolean>`${membershipSales.requestHash} = ${hash}` })
    .from(membershipSales)
    .where(scope);
  return result?.matches ? saleResult(sale) : ({ ok: false, code: 'conflict' } as const);
}
