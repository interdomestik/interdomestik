import { inspect } from 'node:util';

import type { MigrationCorpusErrorCode, MigrationCorpusState } from './migration-corpus-contracts';
import { NODE_FS_OPS } from './migration-corpus-node-fs';
import { CANONICAL_ROOT } from './migration-corpus-root';
import { verifyMigrationCorpusRoot } from './migration-corpus-validator';

const SUMMARY = Object.freeze({
  contract_version: 'canonical_migration_corpus_v1' as const,
  integrity_verified: true as const,
  journaled_migrations: 93 as const,
  excluded_legacy_orphans: 4 as const,
  sql_files: 97 as const,
});
const TOKEN = Symbol('migration-corpus-capability');
const STATES = new WeakMap<object, Readonly<MigrationCorpusState>>();

class MigrationCorpusCapabilityValue {
  constructor(token: symbol) {
    if (token !== TOKEN) throw new TypeError('Invalid migration corpus capability');
    Object.freeze(this);
  }

  toJSON(): typeof SUMMARY {
    return SUMMARY;
  }
  [inspect.custom](): typeof SUMMARY {
    return SUMMARY;
  }
}

Object.freeze(MigrationCorpusCapabilityValue.prototype);
Object.freeze(MigrationCorpusCapabilityValue);

export type MigrationCorpusCapability = MigrationCorpusCapabilityValue;
export type MigrationCorpusVerificationResult =
  | Readonly<{ ok: true; capability: MigrationCorpusCapability }>
  | Readonly<{ ok: false; error: Readonly<{ code: MigrationCorpusErrorCode }> }>;

function issue(state: Readonly<MigrationCorpusState>): MigrationCorpusCapability {
  const capability = new MigrationCorpusCapabilityValue(TOKEN);
  STATES.set(capability, state);
  return capability;
}

export function readMigrationCorpusState(value: unknown): Readonly<MigrationCorpusState> | null {
  if (!value || typeof value !== 'object') return null;
  try {
    if (Object.getPrototypeOf(value) !== MigrationCorpusCapabilityValue.prototype) return null;
    return STATES.get(value) ?? null;
  } catch {
    return null;
  }
}

export async function verifyCanonicalMigrationCorpus(): Promise<MigrationCorpusVerificationResult> {
  const result = await verifyMigrationCorpusRoot(CANONICAL_ROOT, NODE_FS_OPS);
  if (!result.ok) return result;
  return Object.freeze({ ok: true, capability: issue(result.state) });
}
