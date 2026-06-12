import { and, eq } from 'drizzle-orm';

import { db } from './db';
import { domainEventKeys } from './schema/domain-event-keys';
import { eventPiiKeys, eventPiiReferences } from './schema/event-pii-references';

export type DomainEventPiiTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CreateEventPiiReferenceParams = {
  encryptedPayload: string;
  eventId: string;
  keyCiphertext: string;
  keyVersion?: number;
  referenceId?: string;
  referenceKind: string;
  keyId?: string;
  subjectId: string;
  subjectType: string;
  tenantId: string;
};

export type CreateEventPiiReferenceResult = {
  keyId: string;
  referenceId: string;
};

export type ReadEventPiiReferenceParams = {
  referenceId: string;
  tenantId: string;
};

export type ReadEventPiiReferenceResult =
  | {
      encryptedPayload: string;
      keyCiphertext: string;
      keyVersion: number;
      status: 'available';
    }
  | { status: 'erased_or_unavailable' };

function normalizeNonEmpty(api: string, value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${api} requires ${field}`);
  }
  return trimmed;
}

function normalizeKeyVersion(version = 1): number {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('createEventPiiReference requires keyVersion >= 1');
  }
  return version;
}

export async function createEventPiiReference(
  tx: DomainEventPiiTx,
  params: CreateEventPiiReferenceParams
): Promise<CreateEventPiiReferenceResult> {
  const api = 'createEventPiiReference';
  const referenceId = normalizeNonEmpty(
    api,
    params.referenceId ?? crypto.randomUUID(),
    'referenceId'
  );
  const keyId = normalizeNonEmpty(api, params.keyId ?? crypto.randomUUID(), 'keyId');
  const tenantId = normalizeNonEmpty(api, params.tenantId, 'tenantId');
  const eventId = normalizeNonEmpty(api, params.eventId, 'eventId');
  const subjectType = normalizeNonEmpty(api, params.subjectType, 'subjectType');
  const subjectId = normalizeNonEmpty(api, params.subjectId, 'subjectId');
  const referenceKind = normalizeNonEmpty(api, params.referenceKind, 'referenceKind');
  const encryptedPayload = normalizeNonEmpty(api, params.encryptedPayload, 'encryptedPayload');
  const keyCiphertext = normalizeNonEmpty(api, params.keyCiphertext, 'keyCiphertext');
  const keyVersion = normalizeKeyVersion(params.keyVersion);

  await tx.insert(eventPiiReferences).values({
    id: referenceId,
    tenantId,
    eventId,
    subjectType,
    subjectId,
    referenceKind,
    encryptedPayload,
  });

  await tx.insert(eventPiiKeys).values({
    id: keyId,
    tenantId,
    referenceId,
    keyCiphertext,
    keyVersion,
  });

  return { referenceId, keyId };
}

export async function readEventPiiReference(
  tx: DomainEventPiiTx,
  params: ReadEventPiiReferenceParams
): Promise<ReadEventPiiReferenceResult> {
  const api = 'readEventPiiReference';
  const tenantId = normalizeNonEmpty(api, params.tenantId, 'tenantId');
  const referenceId = normalizeNonEmpty(api, params.referenceId, 'referenceId');

  const [row] = await tx
    .select({
      destroyedAt: eventPiiKeys.destroyedAt,
      erasedAt: domainEventKeys.erasedAt,
      encryptedPayload: eventPiiReferences.encryptedPayload,
      keyCiphertext: eventPiiKeys.keyCiphertext,
      keyVersion: eventPiiKeys.keyVersion,
    })
    .from(eventPiiReferences)
    .innerJoin(
      eventPiiKeys,
      and(
        eq(eventPiiKeys.tenantId, eventPiiReferences.tenantId),
        eq(eventPiiKeys.referenceId, eventPiiReferences.id)
      )
    )
    .leftJoin(
      domainEventKeys,
      and(
        eq(domainEventKeys.tenantId, eventPiiReferences.tenantId),
        eq(domainEventKeys.subjectType, eventPiiReferences.subjectType),
        eq(domainEventKeys.subjectId, eventPiiReferences.subjectId)
      )
    )
    .where(and(eq(eventPiiReferences.tenantId, tenantId), eq(eventPiiReferences.id, referenceId)))
    .limit(1);

  if (!row || row.destroyedAt != null || row.erasedAt != null) {
    return { status: 'erased_or_unavailable' };
  }

  return {
    encryptedPayload: row.encryptedPayload,
    keyCiphertext: row.keyCiphertext,
    keyVersion: row.keyVersion,
    status: 'available',
  };
}
