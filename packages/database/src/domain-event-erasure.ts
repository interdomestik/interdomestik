import { and, eq, sql } from 'drizzle-orm';

import { db } from './db';
import { domainEventKeys } from './schema/domain-event-keys';

export type DomainEventErasureTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type MarkSubjectErasedParams = {
  tenantId: string;
  subjectType: string;
  subjectId: string;
};

export type IsSubjectErasedParams = {
  tenantId: string;
  subjectType: string;
  subjectId: string;
};

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`markSubjectErased requires ${field}`);
  }
}

export async function markSubjectErased(
  tx: DomainEventErasureTx,
  params: MarkSubjectErasedParams
): Promise<void> {
  assertNonEmpty(params.tenantId, 'tenantId');
  assertNonEmpty(params.subjectType, 'subjectType');
  assertNonEmpty(params.subjectId, 'subjectId');

  await tx
    .insert(domainEventKeys)
    .values({
      id: crypto.randomUUID(),
      tenantId: params.tenantId,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      erasedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [domainEventKeys.tenantId, domainEventKeys.subjectType, domainEventKeys.subjectId],
      set: { erasedAt: sql`now()` },
    });
}

export async function isSubjectErased(
  tx: DomainEventErasureTx,
  params: IsSubjectErasedParams
): Promise<boolean> {
  const rows = await tx
    .select({ erasedAt: domainEventKeys.erasedAt })
    .from(domainEventKeys)
    .where(
      and(
        eq(domainEventKeys.tenantId, params.tenantId),
        eq(domainEventKeys.subjectType, params.subjectType),
        eq(domainEventKeys.subjectId, params.subjectId)
      )
    );

  return rows.length > 0 && rows[0]?.erasedAt !== null && rows[0]?.erasedAt !== undefined;
}
