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
  locks: [] as unknown[],
  /** When set, consumed by the next document read instead of the stored rows. */
  nextReads: [] as DocumentRow[][],
  updatedClaims: 0,
  updateMatches: true,
  storage: { list: vi.fn(), prefix: vi.fn(), remove: vi.fn(), tail: vi.fn() },
};

/**
 * A transaction double that keeps the rows the command reads and writes. Writes are staged and
 * applied only when the callback returns, so a thrown refusal leaves nothing behind (rollback).
 */
export async function withTenantAuthorityDouble(
  _authority: unknown,
  callback: (tx: unknown) => unknown
): Promise<unknown> {
  const staged: { inserted: Record<string, unknown>[]; updated: number } = {
    inserted: [],
    updated: 0,
  };
  const tx = {
    query: { claims: { findFirst: () => Promise.resolve(db.claim) } },
    execute: (statement: unknown) => {
      db.locks.push(statement);
      return Promise.resolve([]);
    },
    select: () => ({
      from: () => ({
        where: () =>
          Promise.resolve((db.nextReads.shift() ?? db.documents).map(row => ({ ...row }))),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => {
            if (!db.updateMatches) return Promise.resolve([]);
            staged.updated += 1;
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
