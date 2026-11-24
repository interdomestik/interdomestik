import type { TenantTransaction } from '@interdomestik/database';
import {
  exchangeRateBooks,
  exchangeRates,
  exchangeRateVerifications,
} from '@interdomestik/database/schema';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ROLES } from '@interdomestik/shared-auth';
import { and, DrizzleQueryError, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';

import { scaledExchangeRate } from './money';
import { lockLegalEntity } from './plan-versions';
import { recordRateVerificationInputSchema } from './rate-input';
import {
  matchesSaleActor,
  sessionPrincipal,
  type SaleActor,
  type SalePrincipal,
} from './sale-authority';

type VerificationInput = z.output<typeof recordRateVerificationInputSchema>;
type Verification = typeof exchangeRateVerifications.$inferSelect;
type Refusal = 'forbidden' | 'not_found' | 'invalid' | 'conflict' | 'rate_mismatch' | 'stale_rate';
type VerificationResult = { ok: true; verification: Verification } | { ok: false; code: Refusal };

function replayVerification(
  verification: Verification,
  userId: string,
  input: VerificationInput
): VerificationResult {
  if (verification.verifiedBy !== userId) return { ok: false, code: 'not_found' };
  if (
    verification.legalEntityId !== input.legalEntityId ||
    verification.rateId !== input.rateId ||
    verification.sourceRef !== input.sourceRef ||
    scaledExchangeRate(verification.observedRate) !== scaledExchangeRate(input.observedRate)
  ) {
    return { ok: false, code: 'conflict' };
  }
  return { ok: true, verification };
}

async function saveVerification(
  tx: TenantTransaction,
  { tenantId, userId }: SalePrincipal,
  input: VerificationInput
): Promise<VerificationResult> {
  const [state] = await tx
    .select({ isolation: sql<string>`current_setting('transaction_isolation')` })
    .from(sql`(values (1)) as transaction_context`);
  if (state.isolation !== 'read committed') return { ok: false, code: 'invalid' };

  const [book] = await tx
    .select({ id: exchangeRateBooks.id })
    .from(exchangeRateBooks)
    .where(
      withTenant(
        tenantId,
        exchangeRateBooks.tenantId,
        and(eq(exchangeRateBooks.base, 'EUR'), eq(exchangeRateBooks.quote, 'MKD'))
      )
    )
    .for('update');
  if (!book) return { ok: false, code: 'not_found' };
  const entity = await lockLegalEntity(tx, tenantId, input.legalEntityId);
  if (!entity?.isActive) return { ok: false, code: 'not_found' };

  const [prior] = await tx
    .select()
    .from(exchangeRateVerifications)
    .where(
      withTenant(
        tenantId,
        exchangeRateVerifications.tenantId,
        eq(exchangeRateVerifications.operationKey, input.operationKey)
      )
    );
  if (prior) return replayVerification(prior, userId, input);

  const [rate] = await tx
    .select()
    .from(exchangeRates)
    .where(
      withTenant(
        tenantId,
        exchangeRates.tenantId,
        and(eq(exchangeRates.bookId, book.id), eq(exchangeRates.id, input.rateId))
      )
    );
  if (!rate) return { ok: false, code: 'not_found' };
  if (scaledExchangeRate(rate.rate) !== scaledExchangeRate(input.observedRate)) {
    return { ok: false, code: 'rate_mismatch' };
  }

  const [verification] = await tx
    .insert(exchangeRateVerifications)
    .values({
      id: randomUUID(),
      legalEntityId: entity.id,
      bookId: book.id,
      rateId: rate.id,
      base: rate.base,
      quote: rate.quote,
      rateEffectiveOn: rate.effectiveOn,
      observedRate: input.observedRate,
      sourceRef: input.sourceRef,
      operationKey: input.operationKey,
      verifiedAt: sql`null`, // The insert trigger assigns the database stamp under the locks.
      tenantId,
      verifiedBy: userId,
    })
    .returning();
  return { ok: true, verification };
}

function triggerRefusal(error: unknown): Refusal | undefined {
  const failure = error instanceof DrizzleQueryError ? error.cause : error;
  if (
    !failure ||
    typeof failure !== 'object' ||
    !('code' in failure) ||
    !('constraint_name' in failure)
  ) {
    return undefined;
  }
  if (
    failure.code === '23503' &&
    failure.constraint_name === 'exchange_rate_verifications_book_fk'
  ) {
    return 'not_found';
  }
  if (failure.code !== '23514') return undefined;
  switch (failure.constraint_name) {
    case 'exchange_rate_verifications_read_committed_guard':
      return 'invalid';
    case 'exchange_rate_verifications_current_rate':
      return 'stale_rate';
    case 'exchange_rate_verifications_active_entity':
      return 'not_found';
    default:
      return undefined;
  }
}

export async function recordRateVerification(
  authority: TenantAuthority,
  input: unknown,
  actor: SaleActor
): Promise<VerificationResult> {
  const principal = sessionPrincipal(authority, [ROLES.tenant_admin, ROLES.admin]);
  if (!principal || !actor || !matchesSaleActor(principal, actor)) {
    return { ok: false, code: 'forbidden' };
  }
  const parsed = recordRateVerificationInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid' };

  try {
    return await withTenantAuthority(authority, tx => saveVerification(tx, principal, parsed.data));
  } catch (error) {
    const code = triggerRefusal(error);
    if (code) return { ok: false, code };
    throw error;
  }
}
