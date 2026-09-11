export const MODULARITY_POLICY = Object.freeze({
  productionCode: Object.freeze({ preferredLines: 150, reviewLines: 300 }),
  focusedTest: Object.freeze({ maxLines: 300 }),
  structuredArtifact: Object.freeze({ maxBytes: 128 * 1024 }),
  governanceDoc: Object.freeze({ maxLines: 1000, maxBytes: 128 * 1024 }),
  workflowYaml: Object.freeze({}),
});
const STAFF_CURRENT_CLAIM_LEGACY_TEST =
  'packages/domain-claims/src/staff-claims/update-status.test.ts';
const LEGACY_FOCUSED_TEST_CONTRACTS = new Map([
  [
    STAFF_CURRENT_CLAIM_LEGACY_TEST,
    Object.freeze({
      baseLines: 804,
      baseBytes: 29315,
      baseSha256: '2c9782b2d1ee5501049c2c59c309448c687f477eec4a88e8e19856675dafc627',
    }),
  ],
]);
export function legacyFocusedTestContract(filePath) {
  return LEGACY_FOCUSED_TEST_CONTRACTS.get(toPolicyPath(filePath)) ?? null;
}
export const MODULARITY_LINE_LIMIT = MODULARITY_POLICY.productionCode.preferredLines;
const SEMANTIC_GOVERNANCE_PATHS = new Set([
  'docs/plans/current-program.md',
  'docs/plans/current-tracker.md',
]);
export const FILE_CLASSES = Object.freeze({
  productionCode: 'production-code',
  focusedTest: 'focused-test',
  structuredArtifact: 'structured-artifact',
  governanceDoc: 'governance-doc',
  workflowYaml: 'workflow-yaml',
  generatedOrLock: 'generated-or-lock',
  unknown: 'unknown',
});
export const CHECKED_TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.js',
  '.jsx',
  '.json',
  '.jsonl',
  '.md',
  '.mjs',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);
const PRODUCTION_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.js',
  '.jsx',
  '.mjs',
  '.sh',
  '.ts',
  '.tsx',
]);
const STRUCTURED_EXTENSIONS = new Set(['.json', '.jsonl', '.toml', '.yaml', '.yml']);
const STRUCTURED_OWNERS = [
  [/^scripts\/ci\/reviewer-no-tools\.toml$/u, 'reviewer-tool-denial-contract'],
  [/^\.github\/actions\/validation-surface\/action\.yml$/u, 'main-e2e-reuse-workflow-contract'],
  [/^\.github\/reviewer-routing\.json$/u, 'reviewer-routing-contract'],
  [/^docs\/plans\/.*\.json$/u, 'approval-artifact-contract'],
  [/(^|\/)package\.json$|^pnpm-workspace\.yaml$/u, 'package-manifest-contract'],
  [/(^|\/)tsconfig(?:\.[^.]+)?\.json$/u, 'typescript-config-contract'],
  [/^scripts\/(?:ci\/)?[^/]+\.json$/u, 'script-config-contract'],
  [/^(?:components|turbo|vercel)\.json$/u, 'repository-config-contract'],
  [/^\.codex\/config\.toml$/u, 'codex-config-contract'],
];
const T117B_CATALOGS = new Set([
  'apps/web/src/messages/en/dashboard.json',
  'apps/web/src/messages/mk/dashboard.json',
  'apps/web/src/messages/sq/dashboard.json',
  'apps/web/src/messages/sr/dashboard.json',
]);
const GENERATED_EXACT_FILES = new Set([
  'bun.lockb',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);
const GENERATED_PREFIXES = [
  '.next/',
  'apps/web/.next/',
  'apps/web/playwright-report/',
  'apps/web/test-results/',
  'build/',
  'coverage/',
  'dist/',
  'node_modules/',
  'packages/database/drizzle/',
];
const GENERATED_SEGMENTS = new Set(['.next', 'build', 'coverage', 'dist', 'node_modules']);
const extension = filePath => {
  const name = filePath.split('/').at(-1);
  return name.includes('.') ? `.${name.split('.').at(-1)}` : '';
};
export function toPolicyPath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\/+/, '');
}
export function isSemanticGovernanceDocument(filePath) {
  return SEMANTIC_GOVERNANCE_PATHS.has(toPolicyPath(filePath));
}
export function isCheckedTextFile(filePath) {
  return CHECKED_TEXT_EXTENSIONS.has(extension(toPolicyPath(filePath)));
}
export function isExplicitModularityException(filePath) {
  return classifyModularityFile(filePath) === FILE_CLASSES.generatedOrLock;
}
export function structuredArtifactOwner(filePath) {
  const relPath = toPolicyPath(filePath);
  const owner = T117B_CATALOGS.has(relPath)
    ? 't117b-member-portal-i18n-contract'
    : STRUCTURED_OWNERS.find(([pattern]) => pattern.test(relPath))?.[1];
  return owner ?? null;
}
export function classifyModularityFile(filePath) {
  const relPath = toPolicyPath(filePath);
  if (GENERATED_EXACT_FILES.has(relPath) || relPath.endsWith('.d.ts')) {
    return FILE_CLASSES.generatedOrLock;
  }
  if (GENERATED_PREFIXES.some(prefix => relPath.startsWith(prefix))) {
    return FILE_CLASSES.generatedOrLock;
  }
  if (relPath.startsWith('apps/web/public/icon-')) return FILE_CLASSES.generatedOrLock;
  if (relPath.split('/').some(segment => GENERATED_SEGMENTS.has(segment))) {
    return FILE_CLASSES.generatedOrLock;
  }
  if (!isCheckedTextFile(relPath)) return null;
  const ext = extension(relPath);
  if (relPath.startsWith('.github/workflows/') && ['.yaml', '.yml'].includes(ext)) {
    return FILE_CLASSES.workflowYaml;
  }
  if (/(^|\/)(?:__tests__|tests?)\//u.test(relPath) || /\.(?:spec|test)\.[^.]+$/u.test(relPath)) {
    return FILE_CLASSES.focusedTest;
  }
  if (ext === '.md') return FILE_CLASSES.governanceDoc;
  if (STRUCTURED_EXTENSIONS.has(ext)) return FILE_CLASSES.structuredArtifact;
  if (PRODUCTION_EXTENSIONS.has(ext)) return FILE_CLASSES.productionCode;
  return FILE_CLASSES.unknown;
}
export function isModularityChecked(filePath) {
  return classifyModularityFile(filePath) !== null;
}
