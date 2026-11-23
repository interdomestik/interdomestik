import { vi } from 'vitest';

export const TENANT = 'tenant-1';
export const MEMBER = 'member-1';
export const OTHER_MEMBER = 'member-2';
export const CLAIM = 'claim-1';
export const OTHER_CLAIM = 'claim-2';
export const BUCKET = 'claim-evidence';

export type DocumentRow = { bucket: string; claimId: string; filePath: string };

/** The rows and storage objects the draft command reads and writes in the composition tests. */
export const db = {
  claim: null as null | Record<string, unknown>,
  documents: [] as DocumentRow[],
  inserted: [] as Record<string, unknown>[],
  /** Object-lock calls: the transaction they ran in, the tenant and the objects. */
  locks: [] as { objects: unknown[]; tenantId: string; txId: number }[],
  /** When set, consumed by the next document read instead of the stored rows. */
  nextReads: [] as DocumentRow[][],
  updatedClaims: 0,
  /** Row locks the command asked for on its document reads, and the transaction they ran in. */
  rowLocks: [] as { strength: string; txId: number }[],
  /** The transaction that updated the claim, once one did. */
  writeTxId: 0,
  txSequence: 0,
  updateMatches: true,
  storage: { list: vi.fn(), prefix: vi.fn(), remove: vi.fn(), tail: vi.fn() },
};

/**
 * A transaction double that keeps the rows the command reads and writes. Writes are staged and
 * applied only when the callback returns, so a thrown refusal leaves nothing behind (rollback).
 */
function nextRows(): DocumentRow[] {
  return (db.nextReads.shift() ?? db.documents).map(row => ({ ...row }));
}

export async function withTenantAuthorityDouble(
  _authority: unknown,
  callback: (tx: unknown) => unknown
): Promise<unknown> {
  const staged: { inserted: Record<string, unknown>[]; updated: number } = {
    inserted: [],
    updated: 0,
  };
  db.txSequence += 1;
  const tx = {
    id: db.txSequence,
    query: { claims: { findFirst: () => Promise.resolve(db.claim) } },
    // The draft command runs no raw statement itself; its object lock is the mocked module.
    execute: () => Promise.reject(new Error('unexpected raw statement')),
    select: () => ({
      from: () => ({
        // Tenant-wide read of the rows holding the requested paths; `.for('share')` records that
        // the write transaction row-locked what it read.
        where: () => {
          const rows = Promise.resolve(nextRows());
          return Object.assign(rows, {
            for: (strength: string) => {
              db.rowLocks.push({ strength, txId: tx.id });
              return rows;
            },
          });
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => {
            if (!db.updateMatches) return Promise.resolve([]);
            staged.updated += 1;
            db.writeTxId = tx.id;
            return Promise.resolve([{ id: CLAIM }]);
          },
        }),
      }),
    }),
    insert: () => ({
      values: (rows: Record<string, unknown>[]) => {
        staged.inserted.push(...rows);
        return Promise.resolve();
      },
    }),
  };
  const result = await callback(tx);
  db.updatedClaims += staged.updated;
  db.inserted.push(...staged.inserted);
  for (const row of staged.inserted) {
    db.documents.push({
      bucket: String(row.bucket),
      claimId: String(row.claimId),
      filePath: String(row.filePath),
    });
  }
  return result;
}
