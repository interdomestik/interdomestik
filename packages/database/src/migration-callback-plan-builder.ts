import { createHash } from 'node:crypto';

import {
  CallbackPlanFault,
  type OwnedCallbackPlan,
  type OwnedMigration,
} from './migration-callback-plan-contracts';
import {
  CALLBACK_DOMAIN,
  CALLBACK_ITEMS,
  CALLBACK_ITEMS_BYTES,
  CALLBACK_MAX_ITEM_BYTES,
  CALLBACK_MIGRATIONS,
  CALLBACK_PLAN_SHA256,
  CALLBACK_RAW_SHA256,
  CALLBACK_SERIALIZED_BYTES,
  CALLBACK_STATEMENTS,
  MAX_CALLBACK_ITEM_BYTES,
  MAX_CALLBACK_SQL_BYTES,
} from './migration-callback-plan-manifest';
import { MIGRATION_FILE_HASHES } from './migration-corpus-manifest';

const READER = 'MIGRATION_CALLBACK_READER_REJECTED';
const PLAN = 'MIGRATION_CALLBACK_PLAN_REJECTED';
function reject(code: typeof READER | typeof PLAN): never {
  throw new CallbackPlanFault(code);
}
function exactKeys(value: object): boolean {
  if (Object.getOwnPropertySymbols(value).length) return false;
  const names = Object.getOwnPropertyNames(value).sort((left, right) => left.localeCompare(right));
  if (
    names.length !== 4 ||
    names.some((name, index) => name !== ['bps', 'folderMillis', 'hash', 'sql'][index])
  )
    return false;
  return names.every(name => {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    return Boolean(descriptor && 'value' in descriptor && !descriptor.get && !descriptor.set);
  });
}
function plainArray(value: unknown[]): boolean {
  if (Object.getPrototypeOf(value) !== Array.prototype) return false;
  if (Object.getOwnPropertySymbols(value).length) return false;
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length + 1 || names.at(-1) !== 'length') return false;
  for (let index = 0; index < value.length; index += 1) {
    if (names[index] !== String(index)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor) || descriptor.get || descriptor.set) return false;
  }
  return true;
}
function sha(bytes: string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function ownMigration(value: unknown, index: number, seenTimes: Set<number>): OwnedMigration {
  if (!value || typeof value !== 'object' || !exactKeys(value)) reject(READER);
  const item = value as { bps: unknown; folderMillis: unknown; hash: unknown; sql: unknown };
  // prettier-ignore
  if (typeof item.bps !== 'boolean' || typeof item.folderMillis !== 'number' || typeof item.hash !== 'string' || !Array.isArray(item.sql) || !plainArray(item.sql) || item.sql.some(chunk => typeof chunk !== 'string')) reject(READER);
  // prettier-ignore
  if (item.bps !== true || !Number.isSafeInteger(item.folderMillis) || item.folderMillis <= 0 || seenTimes.has(item.folderMillis) || !/^[a-f0-9]{64}$/.test(item.hash) || item.hash !== MIGRATION_FILE_HASHES[index]) reject(PLAN);
  seenTimes.add(item.folderMillis);
  return Object.freeze({
    bps: true,
    folderMillis: item.folderMillis,
    hash: item.hash,
    sql: Object.freeze([...item.sql]),
  });
}

export function buildOwnedMigrationCallbackPlan(input: unknown): OwnedCallbackPlan {
  if (!Array.isArray(input)) reject(READER);
  if (!plainArray(input)) reject(READER);
  if (input.length !== CALLBACK_MIGRATIONS) reject(PLAN);
  const migrations: OwnedMigration[] = [],
    seenTimes = new Set<number>();
  let chunks = 0,
    sqlBytes = 0;
  for (let index = 0; index < input.length; index += 1) {
    const migration = ownMigration(input[index], index, seenTimes);
    for (const chunk of migration.sql) {
      const length = Buffer.byteLength(chunk);
      if (length > MAX_CALLBACK_ITEM_BYTES) reject(PLAN);
      sqlBytes += length;
    }
    chunks += migration.sql.length;
    migrations.push(migration);
  }
  if (chunks !== CALLBACK_STATEMENTS || sqlBytes > MAX_CALLBACK_SQL_BYTES) reject(PLAN);
  const callbackItems: string[] = [],
    entryOffsets: number[] = [];
  for (const migration of migrations) {
    entryOffsets.push(callbackItems.length);
    callbackItems.push(
      ...migration.sql,
      `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES('${migration.hash}', '${migration.folderMillis}')`
    );
  }
  const serialized = JSON.stringify(callbackItems);
  const lengths = callbackItems.map(item => Buffer.byteLength(item));
  const raw = sha(serialized);
  const plan = sha(CALLBACK_DOMAIN + serialized);
  if (
    callbackItems.length !== CALLBACK_ITEMS ||
    Buffer.byteLength(serialized) !== CALLBACK_SERIALIZED_BYTES ||
    lengths.reduce((sum, value) => sum + value, 0) !== CALLBACK_ITEMS_BYTES ||
    Math.max(...lengths) !== CALLBACK_MAX_ITEM_BYTES ||
    raw !== CALLBACK_RAW_SHA256 ||
    plan !== CALLBACK_PLAN_SHA256
  )
    reject(PLAN);
  return Object.freeze({
    migrations: Object.freeze(migrations),
    entryOffsets: Object.freeze(entryOffsets),
    callbackItems: Object.freeze(callbackItems),
    callbackPlanSha256: plan,
  });
}
