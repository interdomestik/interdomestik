import type { TenantTransaction } from '@interdomestik/database';
import { membershipSaleClaims, membershipSales } from '@interdomestik/database/schema';
import { withTenant } from '@interdomestik/database/tenant-security';
import { DrizzleQueryError, eq, sql } from 'drizzle-orm';

import type { SalePrincipal } from './sale-authority';
import { findScopedBuyer, type SaleBuyer } from './sale-buyers';
import type { SaleInput } from './sale-input';

export class SaleInputRefusal extends Error {
  override name = 'SaleInputRefusal';
  readonly issues = { operationKey: 'too_big' } as const;
}

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
  try {
    // The native savepoint keeps an insert error out of the caller's postgres.js scope.
    return await tx.transaction(async claimTx => {
      const [claim] = await claimTx
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
    });
  } catch (error) {
    const cause = error instanceof DrizzleQueryError ? error.cause : error;
    if (
      cause instanceof Error &&
      'code' in cause &&
      cause.code === '23514' &&
      'constraint_name' in cause &&
      (cause.constraint_name === 'membership_sale_claims_operation_key_check' ||
        cause.constraint_name === 'membership_sales_operation_key_check')
    ) {
      throw new SaleInputRefusal('Operation key exceeds the database limit');
    }
    throw error;
  }
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
