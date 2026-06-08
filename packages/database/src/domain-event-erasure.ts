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

  const tenantId = params.tenantId.trim();
  const subjectType = params.subjectType.trim();
  const subjectId = params.subjectId.trim();

  await tx
    .insert(domainEventKeys)
    .values({
      id: crypto.randomUUID(),
      tenantId,
      subjectType,
      subjectId,
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
  const tenantId = params.tenantId.trim();
  const subjectType = params.subjectType.trim();
  const subjectId = params.subjectId.trim();

  const rows = await tx
    .select({ erasedAt: domainEventKeys.erasedAt })
    .from(domainEventKeys)
    .where(
      and(
        eq(domainEventKeys.tenantId, tenantId),
        eq(domainEventKeys.subjectType, subjectType),
        eq(domainEventKeys.subjectId, subjectId)
      )
    );

  return rows.length > 0 && rows[0].erasedAt != null;
}
