import { isDeepStrictEqual } from 'node:util';

import type { MigrationCallbackPlanState } from './migration-callback-plan-contracts';
import { readMigrationCallbackPlanState } from './migration-callback-plan-capability';
import { buildCanonicalMigrationCallbackPlan } from './migration-callback-plan';
import { verifyCanonicalMigrationCorpus } from './migration-corpus-capability';
import { MigrationExecutionFault } from './migration-execution-contracts';

const drift = (): never => {
  throw new MigrationExecutionFault('MIGRATION_EXECUTION_PLAN_DRIFT');
};

export function readAuthenticatedExecutionPlan(
  capability: unknown
): Readonly<MigrationCallbackPlanState> {
  const state = readMigrationCallbackPlanState(capability);
  if (!state) throw new MigrationExecutionFault('MIGRATION_EXECUTION_PLAN_CAPABILITY_REJECTED');
  return state;
}

export async function rebuildMigrationExecutionPlan(
  expected: Readonly<MigrationCallbackPlanState>
): Promise<Readonly<MigrationCallbackPlanState>> {
  const corpus = await verifyCanonicalMigrationCorpus();
  if (!corpus.ok) return drift();
  const plan = await buildCanonicalMigrationCallbackPlan(corpus.capability);
  if (!plan.ok) return drift();
  const state = readMigrationCallbackPlanState(plan.capability);
  if (!state || !isDeepStrictEqual(state, expected)) return drift();
  return state;
}

export function pendingMigrationCallbacks(
  state: Readonly<MigrationCallbackPlanState>,
  applied: number
): readonly string[] {
  if (
    !Number.isInteger(applied) ||
    applied < 0 ||
    applied > 93 ||
    state.migrations.length !== 93 ||
    state.entryOffsets.length !== 93 ||
    state.callbackItems.length !== 843
  )
    drift();
  const offset = applied === 93 ? state.callbackItems.length : state.entryOffsets[applied];
  if (!Number.isInteger(offset) || offset < 0 || offset > state.callbackItems.length) drift();
  return state.callbackItems.slice(offset);
}
