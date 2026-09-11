export type FailureCategory =
  | 'build'
  | 'coverage'
  | 'db'
  | 'e2e'
  | 'i18n'
  | 'precheck'
  | 'release_gate'
  | 'security'
  | 'seed'
  | 'smoke'
  | 'static'
  | 'unit'
  | 'unknown';

type StageDefinition = {
  marker: string;
  stage: string;
};

type FailurePattern = {
  commandPattern: RegExp;
  fallbackStage: string;
  stages: StageDefinition[];
};

const FAILURE_PATTERNS: FailurePattern[] = [
  {
    commandPattern: /\bpnpm pr:verify:hosts\b/,
    fallbackStage: 'pr_verify_hosts',
    stages: [{ marker: 'pr-verify-hosts.sh', stage: 'pr_verify_hosts' }],
  },
  {
    commandPattern: /\bpnpm pr:verify\b/,
    fallbackStage: 'pr_verify',
    stages: [
      { marker: 'test:release-gate', stage: 'release_gate' },
      { marker: 'db:migrations:check-journal', stage: 'db_migrations_check_journal' },
      { marker: 'db:rls:test:required', stage: 'db_rls_test_required' },
      { marker: 'i18n:check', stage: 'i18n_check' },
      { marker: 'i18n:purity:check', stage: 'i18n_purity_check' },
      { marker: 'coverage:gate', stage: 'coverage_gate' },
      { marker: '[Gatekeeper] Applying Schema', stage: 'db_migrate' },
      { marker: 'Building production-like standalone web artifact', stage: 'build_ci' },
      { marker: 'e2e:gate', stage: 'e2e_gate' },
      { marker: 'e2e:smoke', stage: 'e2e_smoke' },
    ],
  },
  {
    commandPattern: /\bpnpm check:fast\b/,
    fallbackStage: 'check_fast',
    stages: [
      { marker: '[check:fast] i18n', stage: 'i18n_check' },
      { marker: '[check:fast] entrypoints', stage: 'static_check' },
      { marker: '[check:fast] portal-layout', stage: 'static_check' },
      { marker: '[check:fast] architecture', stage: 'static_check' },
      { marker: '[check:fast] case-recovery-boundaries', stage: 'static_check' },
      { marker: '[check:fast] country-host-aliases', stage: 'static_check' },
      { marker: '[check:fast] unit', stage: 'unit_test' },
    ],
  },
  {
    commandPattern: /\bpnpm security:guard\b/,
    fallbackStage: 'security_guard',
    stages: [{ marker: 'security-guard.mjs', stage: 'security_guard' }],
  },
  {
    commandPattern: /\bpnpm e2e:gate(?=\s|$)/,
    fallbackStage: 'e2e_gate',
    stages: [
      { marker: '[Gatekeeper] Applying Schema', stage: 'db_migrate' },
      { marker: 'seed:e2e', stage: 'seed_e2e' },
      { marker: 'Building production-like standalone web artifact', stage: 'build_ci' },
      { marker: 'Running 61 tests using 1 worker', stage: 'e2e_gate' },
    ],
  },
  {
    commandPattern: /\bpnpm e2e:gate:pr:fast(?=\s|$)/,
    fallbackStage: 'e2e_gate_pr_fast',
    stages: [
      { marker: '[Gatekeeper] Applying Schema', stage: 'db_migrate' },
      { marker: 'seed:e2e', stage: 'seed_e2e' },
      { marker: 'Building production-like standalone web artifact', stage: 'build_ci' },
      { marker: 'Running 61 tests using 1 worker', stage: 'e2e_gate_pr_fast' },
    ],
  },
  {
    commandPattern: /\be2e:state:setup\b/,
    fallbackStage: 'e2e_state_setup',
    stages: [
      { marker: 'e2e/setup.state.spec.ts', stage: 'e2e_state_setup' },
      { marker: '[Setup] Generating state', stage: 'e2e_state_setup' },
    ],
  },
  {
    commandPattern: /\bbuild:ci\b/,
    fallbackStage: 'build_ci',
    stages: [
      { marker: 'Creating an optimized production build', stage: 'build_ci' },
      { marker: 'Running TypeScript', stage: 'build_ci' },
    ],
  },
];

const STAGE_CATEGORY_MAP: Record<string, FailureCategory> = {
  build_ci: 'build',
  check_fast: 'static',
  coverage_gate: 'coverage',
  db_migrate: 'db',
  db_migrations_check_journal: 'db',
  db_rls_test_required: 'db',
  e2e_gate: 'e2e',
  e2e_gate_pr_fast: 'e2e',
  e2e_state_setup: 'e2e',
  e2e_smoke: 'smoke',
  i18n_check: 'i18n',
  i18n_purity_check: 'i18n',
  memory_precheck: 'precheck',
  pr_verify: 'unknown',
  pr_verify_hosts: 'e2e',
  release_gate: 'release_gate',
  security_guard: 'security',
  seed_e2e: 'seed',
  static_check: 'static',
  unit_test: 'unit',
};

function normalizeFailureCategory(stage: string | null): FailureCategory | null {
  if (!stage) {
    return null;
  }

  return STAGE_CATEGORY_MAP[stage] ?? 'unknown';
}

export function classifyVerificationFailure(command: string, output: string) {
  const pattern = FAILURE_PATTERNS.find(candidate => candidate.commandPattern.test(command));

  if (!pattern) {
    return {
      failedStage: null,
      failureCategory: null,
    };
  }

  let failedStage = pattern.fallbackStage;
  let lastSeenIndex = -1;

  for (const stage of pattern.stages) {
    const stageIndex = output.lastIndexOf(stage.marker);
    if (stageIndex > lastSeenIndex) {
      lastSeenIndex = stageIndex;
      failedStage = stage.stage;
    }
  }

  return {
    failedStage,
    failureCategory: normalizeFailureCategory(failedStage),
  };
}
