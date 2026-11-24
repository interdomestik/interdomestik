import { exchangeRateCheckEvents } from '@interdomestik/database/schema';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import {
  checkOperation,
  checkReceipt,
  readRateCheck,
  lockRateCheckScope,
  parseRateCheck,
  rateCheckFailure,
} from './rate-check-context';
import { beginRateCheckInputSchema, recordRateCheckInconclusiveInputSchema } from './rate-input';
import type { SaleActor } from './sale-authority';

export async function beginRateCheck(authority: TenantAuthority, input: unknown, actor: SaleActor) {
  const check = parseRateCheck(authority, input, actor, beginRateCheckInputSchema);
  if (!check.ok) return check;
  const { principal, request } = check;
  try {
    return await withTenantAuthority(authority, async tx => {
      const scope = await lockRateCheckScope(tx, principal, request.legalEntityId);
      if (!scope.ok) return scope;
      const { tenantId, userId, bookId, legalEntityId } = scope;
      const prior = await checkOperation(tx, scope, request.operationKey);
      if (prior.event) {
        if (prior.event.actorId !== userId) return { ok: false, code: 'not_found' } as const;
        if (prior.event.kind !== 'start' || prior.event.legalEntityId !== legalEntityId) {
          return { ok: false, code: 'conflict' } as const;
        }
        return { ok: true, check: checkReceipt(prior.event) } as const;
      }
      if (prior.verification)
        return {
          ok: false,
          code: prior.verification.verifiedBy === userId ? 'conflict' : 'not_found',
        } as const;

      const [start] = await tx
        .insert(exchangeRateCheckEvents)
        .values({
          id: randomUUID(),
          kind: 'start',
          operationKey: request.operationKey,
          windowId: sql`null`, // The insert guard captures the active window and exact rate head.
          occurredAt: sql`null`,
          tenantId,
          bookId,
          legalEntityId,
          actorId: userId,
        })
        .returning();

      return { ok: true, check: checkReceipt(start) } as const;
    });
  } catch (error) {
    return rateCheckFailure(error);
  }
}

export async function recordRateCheckInconclusive(
  authority: TenantAuthority,
  input: unknown,
  actor: SaleActor
) {
  const check = parseRateCheck(authority, input, actor, recordRateCheckInconclusiveInputSchema);
  if (!check.ok) return check;
  const { principal, request } = check;
  try {
    return await withTenantAuthority(authority, async tx => {
      const scope = await lockRateCheckScope(tx, principal, request.legalEntityId);
      if (!scope.ok) return scope;
      const { tenantId, userId, bookId, legalEntityId } = scope;
      const prior = await checkOperation(tx, scope, request.operationKey);
      if (prior.event) {
        if (prior.event.actorId !== userId) return { ok: false, code: 'not_found' } as const;
        if (
          prior.event.kind !== 'inconclusive' ||
          prior.event.legalEntityId !== legalEntityId ||
          prior.event.checkId !== request.checkId ||
          prior.event.reason !== request.reason
        ) {
          return { ok: false, code: 'conflict' } as const;
        }
        return { ok: true, outcome: checkReceipt(prior.event) } as const;
      }
      if (prior.verification)
        return {
          ok: false,
          code: prior.verification.verifiedBy === userId ? 'conflict' : 'not_found',
        } as const;

      const start = await readRateCheck(tx, scope, request.checkId);
      if (!start || start.legalEntityId !== legalEntityId)
        return { ok: false, code: 'not_found' } as const;
      const [outcome] = await tx
        .insert(exchangeRateCheckEvents)
        .values({
          id: randomUUID(),
          kind: 'inconclusive',
          checkId: start.id,
          windowId: start.windowId,
          rateId: start.rateId,
          rateEffectiveOn: start.rateEffectiveOn,
          reason: request.reason,
          operationKey: request.operationKey,
          occurredAt: sql`null`,
          tenantId,
          bookId,
          legalEntityId,
          actorId: userId,
        })
        .returning();

      return { ok: true, outcome: checkReceipt(outcome) } as const;
    });
  } catch (error) {
    return rateCheckFailure(error);
  }
}
