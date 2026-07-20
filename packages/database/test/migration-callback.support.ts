import assert from 'node:assert/strict';

import {
  verifyCanonicalMigrationCorpus,
  type MigrationCorpusCapability,
} from '../src/migration-corpus-capability';
import { CANONICAL_ROOT } from '../src/migration-corpus-root';
import type { CallbackSourceOps, MigrationReader } from '../src/migration-callback-plan-contracts';
import {
  CALLBACK_SOURCE_OPS,
  verifyMigrationCallbackSources,
} from '../src/migration-callback-source-verifier';

export type ReaderEntry = {
  bps: boolean;
  folderMillis: number;
  hash: string;
  sql: string[];
  [key: symbol]: unknown;
};

export async function authenticCorpus(): Promise<MigrationCorpusCapability> {
  const result = await verifyCanonicalMigrationCorpus();
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('canonical corpus unavailable');
  return result.capability;
}

export async function canonicalReader(): Promise<MigrationReader> {
  const binding = await verifyMigrationCallbackSources();
  assert.ok(binding.reader);
  return binding.reader;
}

export async function canonicalReaderResult(): Promise<ReaderEntry[]> {
  const reader = await canonicalReader();
  return reader({ migrationsFolder: CANONICAL_ROOT }) as ReaderEntry[];
}

export function copyReaderResult(entries: ReaderEntry[]): ReaderEntry[] {
  return entries.map(entry => ({
    bps: entry.bps,
    folderMillis: entry.folderMillis,
    hash: entry.hash,
    sql: [...entry.sql],
  }));
}

export function sourceOps(overrides: Partial<CallbackSourceOps>): Readonly<CallbackSourceOps> {
  return Object.freeze({ ...CALLBACK_SOURCE_OPS, ...overrides });
}

export async function callbackCode<T>(task: () => T | Promise<T>): Promise<string> {
  try {
    await task();
  } catch (error) {
    return (error as { code?: string }).code ?? 'UNKNOWN';
  }
  return 'NO_ERROR';
}
