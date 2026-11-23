import { vi } from 'vitest';

// Synchronous factories that reach the shared doubles at call time. Verifying two files in
// parallel still reaches the real storage module for the second one under vitest, so the
// multi-file accepted case is proven on the real database instead
// (`packages/database/test/draft-claim-attachment-rls.test.ts`).
const storage = () => import('./draft-attachment-intent.state').then(({ db }) => db.storage);
vi.mock('@/lib/storage/service-role', () => ({
  listTenantObjectsForSingleFile: async (...args: unknown[]) => (await storage()).list(...args),
  removeTenantObject: async (...args: unknown[]) => (await storage()).remove(...args),
  usesDeterministicE2EStorage: () => false,
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
