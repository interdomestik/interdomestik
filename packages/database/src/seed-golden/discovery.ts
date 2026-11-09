import {
  E2E_DISCOVERY_DOCUMENT_FIXTURES,
  E2E_SHARE_DOCUMENT_FIXTURES,
  E2E_SHARE_DOCUMENT_SETS,
} from '../e2e-document-fixtures';
import { E2E_DISCOVERY_THREADS, E2E_DISCOVERY_NOTIFICATIONS } from '../e2e-communication-fixtures';
import { E2E_DOCUMENT_FIXTURES, E2E_MESSAGE_FIXTURES } from '../e2e-role-fixtures';
import { E2E_SHARE_PACK_FIXTURES } from '../e2e-share-pack-fixtures';
import { excludedSet } from '../seed-utils/excluded-set';
import type { SeedGoldenContext, SeedGoldenSchema } from './types';

/** Deterministic metadata only; real storage bytes are created through the app in PR 4. */
export function buildDiscoveryClaimDocumentsToSeed(): SeedGoldenSchema['claimDocuments']['$inferInsert'][] {
  return Object.entries(E2E_DISCOVERY_DOCUMENT_FIXTURES).map(([key, fixture]) => ({
    ...fixture,
    createdAt: new Date(
      ['DRAFT', 'REJECTED', 'SUBMITTED_TO_AIRLINE'].includes(key)
        ? '2025-11-04T09:00:00.000Z'
        : '2025-12-02T00:00:00.000Z'
    ),
  }));
}

export function buildDiscoveryShareDocumentsToSeed(): SeedGoldenSchema['documents']['$inferInsert'][] {
  return Object.values(E2E_SHARE_DOCUMENT_FIXTURES).map(row => ({
    ...row,
    uploadedAt: new Date(row.uploadedAt),
    deletedAt: row.deletedAt === null ? null : new Date(row.deletedAt),
  }));
}

export function buildDiscoverySharePacksToSeed(): SeedGoldenSchema['sharePacks']['$inferInsert'][] {
  return Object.values(E2E_SHARE_PACK_FIXTURES).map(({ documentSet, ...row }) => ({
    ...row,
    documentIds: [...E2E_SHARE_DOCUMENT_SETS[documentSet].documentIds],
    createdAt: new Date(row.createdAt),
    expiresAt: new Date(row.expiresAt),
    revokedAt: row.revokedAt === null ? null : new Date(row.revokedAt),
  }));
}

export function buildDiscoveryMessagesToSeed(): SeedGoldenSchema['claimMessages']['$inferInsert'][] {
  return Object.values(E2E_DISCOVERY_THREADS).flatMap(thread =>
    Object.values(thread).map(({ row }) => ({
      ...row,
      createdAt: new Date(row.createdAt),
      readAt: row.readAt === null ? null : new Date(row.readAt),
    }))
  );
}

export function buildDiscoveryNotificationsToSeed(): SeedGoldenSchema['notifications']['$inferInsert'][] {
  return Object.values(E2E_DISCOVERY_NOTIFICATIONS).flatMap(pair =>
    Object.values(pair).map(({ row }) => ({
      ...row,
      createdAt: new Date(row.createdAt),
    }))
  );
}

export function buildDiscoverySnapshot() {
  return {
    claimDocuments: buildDiscoveryClaimDocumentsToSeed(),
    documents: buildDiscoveryShareDocumentsToSeed(),
    sharePacks: buildDiscoverySharePacksToSeed(),
    claimMessages: buildDiscoveryMessagesToSeed(),
    notifications: buildDiscoveryNotificationsToSeed(),
  };
}

/** Rows reused from role-relationships keep that single writer; discovery never rewrites them. */
const REUSED_IDS: ReadonlySet<string> = new Set([
  ...Object.values(E2E_DOCUMENT_FIXTURES).map(row => row.id),
  ...Object.values(E2E_MESSAGE_FIXTURES).map(row => row.id),
]);

export function buildDiscoveryRowsToWrite() {
  const snapshot = buildDiscoverySnapshot();
  return {
    claimDocuments: snapshot.claimDocuments.filter(row => !REUSED_IDS.has(String(row.id))),
    documents: snapshot.documents,
    sharePacks: snapshot.sharePacks,
    claimMessages: snapshot.claimMessages.filter(row => !REUSED_IDS.has(String(row.id))),
    notifications: snapshot.notifications,
  };
}

/** Operator/test CLI only. Called after users, claims and the original evidence/message rows. */
export async function seedDiscovery({ db, schema }: SeedGoldenContext): Promise<void> {
  const snapshot = buildDiscoveryRowsToWrite();
  const upsert = (key: keyof typeof snapshot) => {
    const table = schema[key];
    const rows = snapshot[key];
    return db
      .insert(table)
      .values(rows)
      .onConflictDoUpdate({
        target: table.id,
        set: excludedSet(table, rows[0]),
      });
  };
  await Promise.all(
    (['claimDocuments', 'documents', 'claimMessages', 'notifications'] as const).map(upsert)
  );
  // Pack content references the polymorphic documents, which must already exist.
  await upsert('sharePacks');
}
