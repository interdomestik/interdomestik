import {
  exchangeRateCheckEvents,
  exchangeRates,
  exchangeRateVerifications,
} from '@interdomestik/database/schema';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';

import { scaledExchangeRate } from './money';
import {
  checkOperation,
  checkReceipt,
  readRateCheck,
  lockRateCheckScope,
  parseRateCheck,
  rateCheckFailure,
} from './rate-check-context';
import { recordRateVerificationInputSchema } from './rate-input';
import type { SaleActor } from './sale-authority';

type VerificationInput = z.output<typeof recordRateVerificationInputSchema>;
type Verification = typeof exchangeRateVerifications.$inferSelect;

function matchesEvidence(
  prior: {
    checkId: string | null;
    legalEntityId: string;
    rateId: string | null;
    sourceRef: string | null;
    observedRate: string | null;
  },
  input: VerificationInput
) {
  return (
    prior.checkId === (input.checkId ?? null) &&
    prior.legalEntityId === input.legalEntityId &&
    prior.rateId === input.rateId &&
    prior.sourceRef === input.sourceRef &&
    prior.observedRate !== null &&
    scaledExchangeRate(prior.observedRate) === scaledExchangeRate(input.observedRate)
  );
}

function replayVerification(verification: Verification, userId: string, input: VerificationInput) {
  if (verification.verifiedBy !== userId) return { ok: false, code: 'not_found' } as const;
  if (!matchesEvidence(verification, input)) return { ok: false, code: 'conflict' } as const;
  return { ok: true, verification } as const;
}

export async function recordRateVerification(
  authority: TenantAuthority,
  input: unknown,
  actor: SaleActor
) {
  const check = parseRateCheck(authority, input, actor, recordRateVerificationInputSchema);
  if (!check.ok) return check;
  const { principal, request } = check;
  try {
    return await withTenantAuthority(authority, async tx => {
      const scope = await lockRateCheckScope(tx, principal, request.legalEntityId);
      if (!scope.ok) return scope;
      const { tenantId, userId, bookId, legalEntityId } = scope;
      const prior = await checkOperation(tx, scope, request.operationKey);
      if (prior.verification) return replayVerification(prior.verification, userId, request);
      if (prior.event) {
        if (prior.event.actorId !== userId) return { ok: false, code: 'not_found' } as const;
        if (prior.event.kind !== 'mismatch' || !matchesEvidence(prior.event, request)) {
          return { ok: false, code: 'conflict' } as const;
        }
        return { ok: false, code: 'rate_mismatch', receipt: checkReceipt(prior.event) } as const;
      }

      if (!request.checkId) return { ok: false, code: 'invalid' } as const;
      const start = await readRateCheck(tx, scope, request.checkId);
      if (start?.actorId !== userId || start.legalEntityId !== legalEntityId) {
        return { ok: false, code: 'not_found' } as const;
      }

      const [rate] = await tx
        .select()
        .from(exchangeRates)
        .where(
          withTenant(
            tenantId,
            exchangeRates.tenantId,
            and(eq(exchangeRates.bookId, bookId), eq(exchangeRates.id, request.rateId))
          )
        );
      if (!rate) return { ok: false, code: 'not_found' } as const;
      if (rate.id !== start.rateId) return { ok: false, code: 'stale_rate' } as const;

      if (scaledExchangeRate(rate.rate) !== scaledExchangeRate(request.observedRate)) {
        const [outcome] = await tx
          .insert(exchangeRateCheckEvents)
          .values({
            id: randomUUID(),
            kind: 'mismatch',
            checkId: start.id,
            windowId: start.windowId,
            rateId: rate.id,
            rateEffectiveOn: rate.effectiveOn,
            observedRate: request.observedRate,
            sourceRef: request.sourceRef,
            operationKey: request.operationKey,
            occurredAt: sql`null`,
            tenantId,
            bookId,
            legalEntityId,
            actorId: userId,
          })
          .returning();
        // Returning a typed result allows withTenantAuthority to commit the mismatch receipt.
        return { ok: false, code: 'rate_mismatch', receipt: checkReceipt(outcome) } as const;
      }

      const [verification] = await tx
        .insert(exchangeRateVerifications)
        .values({
          id: randomUUID(),
          checkId: start.id,
          bookId,
          rateId: rate.id,
          base: rate.base,
          quote: rate.quote,
          rateEffectiveOn: rate.effectiveOn,
          observedRate: request.observedRate,
          sourceRef: request.sourceRef,
          operationKey: request.operationKey,
          verifiedAt: sql`null`,
          legalEntityId,
          tenantId,
          verifiedBy: userId,
        })
        .returning();
      if (!verification) throw new Error('Rate verification insert returned no row');
      return { ok: true, verification } as const;
    });
  } catch (error) {
    return rateCheckFailure(error);
  }
}
