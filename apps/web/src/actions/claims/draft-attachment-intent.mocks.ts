import { vi } from 'vitest';

vi.mock('@/lib/storage/service-role', async () => {
  const { db } = await import('./draft-attachment-intent.state');
  return {
    listTenantObjectsForSingleFile: db.storage.list,
    removeTenantObject: db.storage.remove,
    usesDeterministicE2EStorage: () => false,
  };
});
vi.mock('@/lib/storage/object-prefix', async () => {
  const { db } = await import('./draft-attachment-intent.state');
  return { readTenantObjectPrefix: db.storage.prefix, readTenantObjectTail: db.storage.tail };
});
vi.mock('@interdomestik/database/claim-evidence-object-lock', async () => {
  const { db } = await import('./draft-attachment-intent.state');
  return {
    lockClaimEvidenceObjects: (tx: { id: number }, tenantId: string, objects: unknown[]) => {
      db.locks.push({ objects, tenantId, txId: tx.id });
      return Promise.resolve();
    },
  };
});
vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@interdomestik/database/tenant-authority-context', async () => ({
  withTenantAuthority: (await import('./draft-attachment-intent.state')).withTenantAuthorityDouble,
}));
