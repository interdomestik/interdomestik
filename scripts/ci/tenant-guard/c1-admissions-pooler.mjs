// Owner-approved 2026-11-11 runtime transaction-pooler compatibility. Exact-byte C1 closure
// admission for the two changed pure/configuration units; no caller or sink-edge admission.
export const DB_TRANSACTION_POOLER = {
  id: 'db-transaction-pooler-2026-11',
  reason:
    'Disable postgres.js prepared statements only for port 6543 or the explicit ' +
    'DB_TRANSACTION_POOLER=1 override. Existing tenant context, role assertions, lifetime ' +
    'fencing, connection limits, TLS, timeouts and global reuse remain unchanged. ' +
    'Legacy kernel pins independently bind the complete runtime import closure.',
  files: [
    {
      file: 'packages/database/src/db.ts',
      sha256: '42c2dc61f834baa9e04d4a5ea30a6ee3a15e48dfef3bdb608d80d458842d432e',
      units: ['createQueryClient'],
    },
    {
      file: 'packages/database/src/pooler-mode.ts',
      sha256: '104ed0d2f7a5f71d2e2706fe6bb262dd6c6cedeea4b615fc804cb204d35311a3',
      units: ['isTransactionPooler'],
    },
  ],
  sinkEdges: [],
};
