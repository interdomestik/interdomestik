import { authorizeInngestEventTenant } from '@interdomestik/database';
import type { IngressCapability } from '@interdomestik/database/ingress';
import { exchangeRateBooks, exchangeRates } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ROLES } from '@interdomestik/shared-auth';
import { and, desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';

import { recordExchangeRateInputSchema, scheduledExchangeRateInputSchema } from './rate-input';

type RateInput = z.output<typeof recordExchangeRateInputSchema>;
type Failure = { ok: false; code: 'invalid' | 'conflict' | 'forbidden' | 'not_found' };
type Publication = { ok: true; rate: typeof exchangeRates.$inferSelect } | Failure;
type Publisher = { kind: 'staff'; userId: string } | { kind: 'inngest' };

async function publishRate(
  authority: TenantAuthority,
  input: RateInput,
  publisher: Publisher
): Promise<Publication> {
  const { accessTenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, async tx => {
    const [book] = await tx
      .select({ id: exchangeRateBooks.id })
      .from(exchangeRateBooks)
      .where(
        withTenant(
          accessTenantId,
          exchangeRateBooks.tenantId,
          and(eq(exchangeRateBooks.base, input.base), eq(exchangeRateBooks.quote, input.quote))
        )
      )
      .for('update');
    if (!book) return { ok: false, code: 'not_found' };

    let revision = 1;
    if (input.correctsRateId !== undefined) {
      const bookScope = withTenant(
        accessTenantId,
        exchangeRates.tenantId,
        eq(exchangeRates.bookId, book.id)
      );
      const [predecessor] = await tx
        .select()
        .from(exchangeRates)
        .where(and(bookScope, eq(exchangeRates.id, input.correctsRateId)));
      if (!predecessor) return { ok: false, code: 'conflict' };

      const [current] = await tx
        .select({ id: exchangeRates.id })
        .from(exchangeRates)
        .where(and(bookScope, eq(exchangeRates.weekStartsOn, predecessor.weekStartsOn)))
        .orderBy(desc(exchangeRates.revision))
        .limit(1);
      if (current?.id !== predecessor.id) return { ok: false, code: 'conflict' };
      if (predecessor.effectiveOn !== input.effectiveOn) return { ok: false, code: 'invalid' };
      revision = predecessor.revision + 1;
    }

    const [rate] = await tx
      .insert(exchangeRates)
      .values({
        id: randomUUID(),
        bookId: book.id,
        base: input.base,
        quote: input.quote,
        rate: input.rate,
        effectiveOn: input.effectiveOn,
        weekStartsOn: sql`null`, // The insert trigger derives the ISO week.
        revision,
        correctsRateId: input.correctsRateId ?? null,
        correctionReason: input.correctionReason ?? null,
        source: 'nbrm',
        storedAt: sql`null`, // The insert trigger stamps the time under the book lock.
        tenantId: accessTenantId,
        callerKind: publisher.kind,
        storedBy: publisher.kind === 'staff' ? publisher.userId : null,
      })
      .onConflictDoNothing({
        target: [
          exchangeRates.tenantId,
          exchangeRates.bookId,
          exchangeRates.weekStartsOn,
          exchangeRates.revision,
        ],
      })
      .returning();
    return rate ? { ok: true, rate } : { ok: false, code: 'conflict' };
  });
}

export async function recordExchangeRate(
  authority: TenantAuthority,
  input: unknown,
  actor: { id: string; tenantId?: string | null }
): Promise<Publication> {
  let session;
  try {
    session = readTenantAuthority(authority);
  } catch {
    return { ok: false, code: 'forbidden' };
  }
  if (
    session.purpose !== 'session' ||
    session.principal?.role !== ROLES.tenant_admin ||
    session.principal.userId !== actor.id ||
    session.tenantId !== session.accessTenantId ||
    session.tenantId !== actor.tenantId
  ) {
    return { ok: false, code: 'forbidden' };
  }

  const parsed = recordExchangeRateInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid' };
  const { correctsRateId, correctionReason } = parsed.data;
  if ((correctsRateId === undefined) !== (correctionReason === undefined)) {
    return { ok: false, code: 'invalid' };
  }
  return publishRate(authority, parsed.data, { kind: 'staff', userId: actor.id });
}

const INNGEST_REFUSALS = new Set([
  'Unrecognized ingress capability',
  'Expired ingress capability',
  'Inngest tenant authority requires an event tenant',
  'Inngest tenant authority requires an existing tenant',
]);

export async function recordExchangeRateScheduled(
  ingress: IngressCapability<'inngest'>,
  input: unknown
): Promise<Publication> {
  const parsed = scheduledExchangeRateInputSchema.safeParse(input);
  let tenantId: unknown = parsed.data?.tenantId;
  // A malformed rate still needs authorization for the tenant named in the payload.
  if (!parsed.success && typeof input === 'object' && input !== null && 'tenantId' in input) {
    tenantId = input.tenantId;
  }
  if (typeof tenantId !== 'string') return { ok: false, code: 'forbidden' };

  let authority;
  try {
    authority = await authorizeInngestEventTenant(ingress, tenantId);
  } catch (error) {
    // The existing authority helper uses plain Errors for refusals. Connection failures retry.
    if (error instanceof Error && INNGEST_REFUSALS.has(error.message)) {
      return { ok: false, code: 'forbidden' };
    }
    throw error;
  }

  if (!parsed.success) return { ok: false, code: 'invalid' };
  return publishRate(authority, parsed.data, { kind: 'inngest' });
}
