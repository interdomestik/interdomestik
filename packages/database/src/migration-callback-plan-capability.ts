import { inspect } from 'node:util';

import type {
  MigrationCallbackPlanErrorCode,
  MigrationCallbackPlanState,
} from './migration-callback-plan-contracts';
import {
  CALLBACK_ITEMS,
  CALLBACK_MIGRATIONS,
  CALLBACK_PLAN_SHA256,
  CALLBACK_STATEMENTS,
  DRIZZLE_VERSION,
} from './migration-callback-plan-manifest';

const SUMMARY = Object.freeze({
  contract_version: 'canonical_pg_proxy_callback_plan_v1' as const,
  drizzle_orm_version: DRIZZLE_VERSION,
  journaled_migrations: CALLBACK_MIGRATIONS,
  statement_chunks: CALLBACK_STATEMENTS,
  callback_items: CALLBACK_ITEMS,
  callback_plan_sha256: CALLBACK_PLAN_SHA256,
});
const TOKEN = Symbol('migration-callback-plan-capability');
const STATES = new WeakMap<object, Readonly<MigrationCallbackPlanState>>();

class MigrationCallbackPlanCapabilityValue {
  constructor(token: symbol) {
    if (token !== TOKEN) throw new TypeError('Invalid migration callback plan capability');
    Object.freeze(this);
  }
  toJSON(): typeof SUMMARY {
    return SUMMARY;
  }
  [inspect.custom](): typeof SUMMARY {
    return SUMMARY;
  }
}
Object.freeze(MigrationCallbackPlanCapabilityValue.prototype);
Object.freeze(MigrationCallbackPlanCapabilityValue);

export type MigrationCallbackPlanCapability = MigrationCallbackPlanCapabilityValue;
export type MigrationCallbackPlanResult =
  | Readonly<{ ok: true; capability: MigrationCallbackPlanCapability }>
  | Readonly<{ ok: false; error: Readonly<{ code: MigrationCallbackPlanErrorCode }> }>;

export function issueMigrationCallbackPlanCapability(
  state: Readonly<MigrationCallbackPlanState>
): MigrationCallbackPlanCapability {
  const capability = new MigrationCallbackPlanCapabilityValue(TOKEN);
  STATES.set(capability, state);
  return capability;
}

export function readMigrationCallbackPlanState(
  value: unknown
): Readonly<MigrationCallbackPlanState> | null {
  if (!value || typeof value !== 'object') return null;
  try {
    if (Object.getPrototypeOf(value) !== MigrationCallbackPlanCapabilityValue.prototype)
      return null;
    return STATES.get(value) ?? null;
  } catch {
    return null;
  }
}
