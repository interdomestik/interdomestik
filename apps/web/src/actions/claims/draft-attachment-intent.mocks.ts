import { vi } from 'vitest';

// Synchronous factories that reach the shared doubles at call time: an async factory can lose a
// race when two files are verified in parallel and hand one of them the real storage module.
const storage = () => import('./draft-attachment-intent.state').then(({ db }) => db.storage);
vi.mock('@/lib/storage/service-role', () => ({
  listTenantObjectsForSingleFile: async (...args: unknown[]) => (await storage()).list(...args),
  removeTenantObject: async (...args: unknown[]) => (await storage()).remove(...args),
  usesDeterministicE2EStorage: () => false,
}));
// The storage boundary itself, for any path that still reaches the real storage module.
vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  createAdminClient: () => ({
    storage: {
      from: () => ({
        list: async (...args: unknown[]) => (await storage()).list(...args),
        remove: async (...args: unknown[]) => (await storage()).remove(...args),
      }),
    },
  }),
}));
vi.mock('@/lib/storage/object-prefix', () => ({
  readTenantObjectPrefix: async (...args: unknown[]) => (await storage()).prefix(...args),
  readTenantObjectTail: async (...args: unknown[]) => (await storage()).tail(...args),
}));
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
