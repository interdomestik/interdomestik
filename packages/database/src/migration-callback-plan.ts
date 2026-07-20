import type { MigrationCorpusState } from './migration-corpus-contracts';
// prettier-ignore
import { readMigrationCorpusState, verifyCanonicalMigrationCorpus, type MigrationCorpusCapability } from './migration-corpus-capability';
import { buildOwnedMigrationCallbackPlan } from './migration-callback-plan-builder';
// prettier-ignore
import { issueMigrationCallbackPlanCapability, type MigrationCallbackPlanResult } from './migration-callback-plan-capability';
import {
  CallbackPlanFault,
  type CallbackSourceBinding,
  type MigrationCallbackPlanErrorCode,
  type MigrationCallbackPlanState,
} from './migration-callback-plan-contracts';
import {
  recheckMigrationCallbackSources,
  verifyMigrationCallbackSources,
} from './migration-callback-source-verifier';
type CorpusResult = Awaited<ReturnType<typeof verifyCanonicalMigrationCorpus>>;
type StateResult =
  | Readonly<{ ok: true; state: MigrationCallbackPlanState }>
  | Readonly<{ ok: false; error: Readonly<{ code: MigrationCallbackPlanErrorCode }> }>;
export type MigrationCallbackPlanDependencies = Readonly<{
  readCorpus(value: unknown): Readonly<MigrationCorpusState> | null;
  verifyCorpus(): Promise<CorpusResult>;
  bindSources(): Promise<CallbackSourceBinding>;
  recheckSources(binding: CallbackSourceBinding): Promise<void>;
}>;
const DEFAULTS: MigrationCallbackPlanDependencies = Object.freeze({
  readCorpus: readMigrationCorpusState,
  verifyCorpus: verifyCanonicalMigrationCorpus,
  bindSources: () => verifyMigrationCallbackSources(),
  recheckSources: recheckMigrationCallbackSources,
});
function sameStat(
  left: MigrationCorpusState['rootIdentity'],
  right: MigrationCorpusState['rootIdentity']
): boolean {
  // prettier-ignore
  return left.dev === right.dev && left.ino === right.ino && left.nlink === right.nlink && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs && left.kind === right.kind;
}
// prettier-ignore
function sameList(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
function sameCorpus(left: MigrationCorpusState, right: MigrationCorpusState): boolean {
  // prettier-ignore
  return left.realRoot === right.realRoot && left.journalSha256 === right.journalSha256 && left.corpusSha256 === right.corpusSha256 && sameList(left.journalNames, right.journalNames) && sameList(left.excludedNames, right.excludedNames) && sameStat(left.rootIdentity, right.rootIdentity);
}
function failure(code: MigrationCallbackPlanErrorCode): Extract<StateResult, { ok: false }> {
  return Object.freeze({ ok: false, error: Object.freeze({ code }) });
}
const needsPostScan = (code?: MigrationCallbackPlanErrorCode) =>
  !code || code === 'MIGRATION_CALLBACK_PLAN_REJECTED';
async function readPostCorpus(
  dependencies: MigrationCallbackPlanDependencies
): Promise<Readonly<MigrationCorpusState> | null> {
  try {
    const post = await dependencies.verifyCorpus();
    return post.ok ? dependencies.readCorpus(post.capability) : null;
  } catch {
    return null;
  }
}
async function buildState(
  capability: unknown,
  dependencies: MigrationCallbackPlanDependencies
): Promise<StateResult> {
  const preCorpus = dependencies.readCorpus(capability);
  if (!preCorpus) return failure('MIGRATION_CALLBACK_CORPUS_CAPABILITY_REJECTED');
  let phase: MigrationCallbackPlanErrorCode = 'MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED';
  try {
    const sources = await dependencies.bindSources();
    if (!sources.reader)
      throw new CallbackPlanFault('MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED');
    let plan: ReturnType<typeof buildOwnedMigrationCallbackPlan> | undefined;
    let deferred: MigrationCallbackPlanErrorCode | undefined;
    try {
      phase = 'MIGRATION_CALLBACK_READER_REJECTED';
      const readerResult = await sources.reader({ migrationsFolder: preCorpus.realRoot });
      plan = buildOwnedMigrationCallbackPlan(readerResult);
    } catch (error) {
      deferred = error instanceof CallbackPlanFault ? error.code : phase;
    }
    let postCorpus: Readonly<MigrationCorpusState> | null = null,
      corpusChanged = false;
    if (needsPostScan(deferred)) {
      phase = 'MIGRATION_CALLBACK_CORPUS_CHANGED_DURING_READ';
      postCorpus = await readPostCorpus(dependencies);
      corpusChanged = !postCorpus || !sameCorpus(preCorpus, postCorpus);
    }
    phase = 'MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED';
    await dependencies.recheckSources(sources);
    if (deferred === 'MIGRATION_CALLBACK_READER_REJECTED') return failure(deferred);
    if (corpusChanged) return failure('MIGRATION_CALLBACK_CORPUS_CHANGED_DURING_READ');
    if (deferred) return failure(deferred);
    if (!plan || !postCorpus) return failure('MIGRATION_CALLBACK_PLAN_REJECTED');
    const state: MigrationCallbackPlanState = Object.freeze({
      preCorpus,
      postCorpus,
      migrations: plan.migrations,
      entryOffsets: plan.entryOffsets,
      callbackItems: plan.callbackItems,
      callbackPlanSha256: plan.callbackPlanSha256,
      dependencyHashes: sources.hashes,
    });
    return Object.freeze({ ok: true, state });
  } catch (error) {
    const code = error instanceof CallbackPlanFault ? error.code : phase;
    return failure(code);
  }
}
export async function testMigrationCallbackPlanWithDependencies(
  capability: unknown,
  dependencies: MigrationCallbackPlanDependencies
): Promise<MigrationCallbackPlanErrorCode | null> {
  const result = await buildState(capability, dependencies);
  return result.ok ? null : result.error.code;
}
export async function buildCanonicalMigrationCallbackPlan(
  capability: MigrationCorpusCapability
): Promise<MigrationCallbackPlanResult> {
  const result = await buildState(capability, DEFAULTS);
  if (!result.ok) return result;
  return Object.freeze({
    ok: true,
    capability: issueMigrationCallbackPlanCapability(result.state),
  });
}
