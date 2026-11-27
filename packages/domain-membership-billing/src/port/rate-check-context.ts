import type { TenantTransaction } from '@interdomestik/database';
import {
  exchangeRateBooks,
  exchangeRateCheckEvents,
  exchangeRateVerifications,
} from '@interdomestik/database/schema';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ROLES } from '@interdomestik/shared-auth';
import { and, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';

import { lockLegalEntity } from './plan-versions';
import { rateConstraint } from './rate-db-error';
import {
  matchesSaleActor,
  sessionPrincipal,
  type SaleActor,
  type SalePrincipal,
} from './sale-authority';

type Refusal = 'forbidden' | 'not_found' | 'invalid' | 'conflict' | 'stale_rate';
type CheckRefusal = { ok: false; code: Refusal };
type CheckEvent = typeof exchangeRateCheckEvents.$inferSelect;

type CheckScope = {
  tenantId: string;
  userId: string;
  bookId: string;
  legalEntityId: string;
};

function triggerRefusal(error: unknown): Refusal | undefined {
  switch (rateConstraint(error, '23514')) {
    case 'exchange_rate_check_events_read_committed':
    case 'exchange_rate_verifications_read_committed_guard':
      return 'invalid';
    case 'exchange_rate_check_events_active_entity':
    case 'exchange_rate_verifications_active_entity':
      return 'not_found';
    case 'exchange_rate_check_pending':
      return 'conflict';
    case 'exchange_rate_check_current_start':
    case 'exchange_rate_check_window_closed':
    case 'exchange_rate_check_mismatch_guard':
    case 'exchange_rate_verifications_current_rate':
    case 'exchange_rate_verifications_disputed_rate':
      return 'stale_rate';
  }

  switch (rateConstraint(error, '23505')) {
    case 'exchange_rate_check_operation_guard':
    case 'exchange_rate_check_terminal_guard':
      return 'conflict';
  }

  switch (rateConstraint(error, '23503')) {
    case 'exchange_rate_verifications_book_fk':
    case 'exchange_rate_verifications_check_fk':
      return 'not_found';
  }
  return undefined;
}

export function parseRateCheck<Input extends { legalEntityId: string }>(
  authority: TenantAuthority,
  input: unknown,
  actor: SaleActor,
  schema: z.ZodType<Input>
) {
  const principal = sessionPrincipal(authority, [ROLES.tenant_admin, ROLES.admin]);
  if (!principal || !actor || !matchesSaleActor(principal, actor)) {
    return { ok: false, code: 'forbidden' } as const;
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid' } as const;
  return { ok: true, principal, request: parsed.data } as const;
}

export async function lockRateCheckScope(
  tx: TenantTransaction,
  { tenantId, userId }: SalePrincipal,
  entityId: string
): Promise<({ ok: true } & CheckScope) | CheckRefusal> {
  const [{ isolation }] = await tx.execute<{ isolation: string }>(
    sql`select current_setting('transaction_isolation') as isolation`
  );
  if (isolation !== 'read committed') return { ok: false, code: 'invalid' };

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
  const entity = await lockLegalEntity(tx, tenantId, entityId);
  if (!entity?.isActive) return { ok: false, code: 'not_found' };
  return { ok: true, tenantId, userId, bookId: book.id, legalEntityId: entity.id };
}

export function rateCheckFailure(error: unknown): CheckRefusal {
  const code = triggerRefusal(error);
  if (code) return { ok: false, code };
  throw error;
}

export async function checkOperation(
  tx: TenantTransaction,
  { tenantId, bookId }: CheckScope,
  operationKey: string
) {
  const [event] = await tx
    .select()
    .from(exchangeRateCheckEvents)
    .where(
      withTenant(
        tenantId,
        exchangeRateCheckEvents.tenantId,
        and(
          eq(exchangeRateCheckEvents.bookId, bookId),
          eq(exchangeRateCheckEvents.operationKey, operationKey)
        )
      )
    );
  if (event) return { event };

  const [verification] = await tx
    .select()
    .from(exchangeRateVerifications)
    .where(
      withTenant(
        tenantId,
        exchangeRateVerifications.tenantId,
        and(
          eq(exchangeRateVerifications.bookId, bookId),
          eq(exchangeRateVerifications.operationKey, operationKey)
        )
      )
    );
  return { verification };
}

export async function readRateCheck(
  tx: TenantTransaction,
  { tenantId, bookId }: CheckScope,
  checkId: string
) {
  const [start] = await tx
    .select()
    .from(exchangeRateCheckEvents)
    .where(
      withTenant(
        tenantId,
        exchangeRateCheckEvents.tenantId,
        and(
          eq(exchangeRateCheckEvents.bookId, bookId),
          eq(exchangeRateCheckEvents.id, checkId),
          eq(exchangeRateCheckEvents.kind, 'start')
        )
      )
    );
  return start;
}

export function checkReceipt(event: CheckEvent) {
  return {
    id: event.id,
    checkId: event.checkId,
    rateId: event.rateId,
    occurredAt: event.occurredAt,
  };
}
