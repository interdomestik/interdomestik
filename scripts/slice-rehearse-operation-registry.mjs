import { compareText, must } from './slice-rehearse-canonical.mjs';

// This inventory describes existing procedures. It is not an effect adapter or
// approval source. No current mutation has demonstrated every D9 dispatch gate.
export const OPERATION_CLASSES = Object.freeze([
  'dispatchable',
  'read-only',
  'manual',
  'unsupported',
  'retired',
]);
const entries = [];
function register(family, name, classification, procedure, description, missingFacts = []) {
  entries.push(
    Object.freeze({
      id: `${family}:${name}`,
      family,
      name,
      classification,
      procedure,
      description,
      missingFacts: Object.freeze(missingFacts),
    })
  );
}
const manual = (name, procedure, description) =>
  register('routine', name, 'manual', procedure, description, [
    'current-authorization',
    'typed-effect-adapter',
  ]);
manual(
  'add_focused_test',
  'scripts/slice-rehearse-writer-policy.mjs',
  'Add a relevant focused test within the authorized writer scope.'
);
manual(
  'extract_cohesive_helper',
  'scripts/slice-rehearse-writer-policy.mjs',
  'Review cohesion and extract a helper only within the authorized scope.'
);
manual(
  'split_focused_test',
  'scripts/slice-rehearse-writer-policy.mjs',
  'Split a focused test when the executable modularity policy requires it.'
);
manual(
  'derived_capacity_rebind',
  'scripts/slice-rehearse-capacity.mjs',
  'Review the existing derived capacity proposal and its exact writer allocation.'
);
manual(
  'fresh_worktree_patch_replay',
  'scripts/slice-rehearse-evaluator.mjs',
  'Reconcile the authorized writer changes against fresh protected-main facts.'
);
manual(
  'sequence_prerequisite_before_projection',
  'scripts/slice-rehearse-evaluator.mjs',
  'Complete the authorized prerequisite before projection closeout.'
);
manual(
  'rerun_invalidated_proof',
  'scripts/slice-rehearse-proof-plan.mjs',
  'Use the existing proof plan and proof runner after current authority is established.'
);
manual(
  'compile_same_slice_delivery',
  'scripts/slice-rehearse-operation-contracts.mjs',
  'Review the compiled same-slice lifecycle; compilation does not dispatch its stages.'
);
register(
  'routine',
  'bounded_force_with_lease_rebuild',
  'unsupported',
  'scripts/slice-rehearse-operation-schema.mjs',
  'The routine binds an exact lease, but the safe-operation executor has no force-with-lease adapter.',
  ['typed-effect-adapter', 'durable-issuer']
);
register(
  'routine',
  'apply_full_gate_label',
  'manual',
  'scripts/slice-rehearse-operation-contracts.mjs',
  'Resolve the literal full-gate contract and fresh PR identity before authorized provider handling.',
  ['current-authorization', 'conditional-provider', 'durable-issuer']
);
register(
  'routine',
  'stale_pr_disposition',
  'manual',
  'scripts/slice-rehearse-operation-certificate.mjs',
  'Review the compiled stale prerequisite role before authorized PR disposition.',
  ['current-authorization', 'conditional-provider', 'durable-issuer']
);
register(
  'routine',
  'task_owned_cleanup',
  'unsupported',
  'scripts/slice-rehearse-ops-cli.mjs',
  'Cleanup remains held: crash-safe consumption and resource-specific ownership are unproven.',
  ['resource-ownership', 'durable-issuer']
);

for (const [name, description] of [
  ['branch_push', 'The fixed Git push mapping has no expected-old-ref CAS.'],
  [
    'pr_create',
    'PR creation has fixed arguments but lacks conditional creation and durable correlation.',
  ],
  ['label_add', 'Label mutation has typed inputs but no conditional PR-state update.'],
  [
    'feedback_comment',
    'Comment mutation has a bound body artifact but lacks safe duplicate correlation.',
  ],
  ['stale_pr_disposition', 'PR closure has a compiled role but no conditional state transition.'],
  [
    'conditional_merge',
    'Merge recovery requires an independently supplied conditional adapter and approved durable issuer.',
  ],
])
  register('executor', name, 'manual', 'scripts/slice-rehearse-ops.mjs', description, [
    'current-authorization',
    'conditional-provider',
    'durable-issuer',
  ]);

register(
  'diagnostic',
  'recollect',
  'read-only',
  'scripts/slice-rehearse.mjs',
  'Recollect through the existing rehearsal entrypoint; inspect the new report before any effect.'
);
register(
  'diagnostic',
  'unknown-hold',
  'read-only',
  'scripts/slice-rehearse.mjs',
  'An unrecognized diagnostic remains held. Review the existing report with the repository owner.'
);
for (const [name, classification, procedure, description, missing] of [
  [
    'doctor',
    'unsupported',
    'scripts/dev/doctor.sh',
    'Doctor can restart Docker, start Supabase, migrate data and remove containers selected by ports and names.',
    ['resource-ownership', 'typed-effect-adapter'],
  ],
  [
    'dev:clean',
    'unsupported',
    'package.json',
    'This entrypoint kills listeners selected by port; a port is not task ownership.',
    ['resource-ownership'],
  ],
  [
    'boot:dev',
    'manual',
    'package.json',
    'Starts development services and writes caches; requires authorized preparation.',
    ['current-authorization', 'resource-ownership'],
  ],
  [
    'boot:local',
    'manual',
    'package.json',
    'Seeds local data before starting development; requires authorized fixture and environment scope.',
    ['current-authorization', 'resource-ownership'],
  ],
  [
    'boot:e2e',
    'manual',
    'package.json',
    'Seeds fixtures and runs the seed contract; requires authorized database scope.',
    ['current-authorization', 'resource-ownership'],
  ],
  [
    'db:migrate',
    'manual',
    'package.json',
    'Applies database migrations through the existing database package.',
    ['current-authorization', 'resource-ownership'],
  ],
  [
    'db:push:local',
    'manual',
    'package.json',
    'Changes the local database schema through the existing package.',
    ['current-authorization', 'resource-ownership'],
  ],
  [
    'seed:e2e',
    'manual',
    'packages/database/src/seed.ts',
    'Writes deterministic database fixtures; requires the exact authorized database identity.',
    ['current-authorization', 'resource-ownership'],
  ],
  [
    'ci-local-lowdisk',
    'unsupported',
    'scripts/ci-local-lowdisk.sh',
    'Its exit trap invokes Docker reclamation, including global unused-container, image and build-cache pruning.',
    ['resource-ownership', 'durable-issuer'],
  ],
  [
    'docker-gate',
    'unsupported',
    'scripts/docker-gate.sh',
    'Starts services, migrates, seeds and invokes reclamation from its exit trap.',
    ['resource-ownership', 'durable-issuer'],
  ],
  [
    'slice:cleanup',
    'unsupported',
    'scripts/slice-rehearse-ops-cli.mjs',
    'The cleanup CLI explicitly returns cleanup_hold without deleting resources.',
    ['resource-ownership', 'durable-issuer'],
  ],
])
  register('entrypoint', name, classification, procedure, description, missing);

export const OPERATION_REGISTRY = Object.freeze(
  Object.fromEntries(
    entries.sort((a, b) => compareText(a.id, b.id)).map(entry => [entry.id, entry])
  )
);

export function resolveRecoveryProcedures(ids) {
  must(Array.isArray(ids) && ids.length <= entries.length, 'recovery IDs are invalid');
  must(new Set(ids).size === ids.length, 'recovery IDs must be unique');
  return ids
    .map(id => {
      must(typeof id === 'string' && Object.hasOwn(OPERATION_REGISTRY, id), 'unknown recovery ID');
      return OPERATION_REGISTRY[id];
    })
    .sort((a, b) => compareText(a.id, b.id));
}
