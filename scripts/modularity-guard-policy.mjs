export const MODULARITY_LINE_LIMIT = 150;
// CI enforces the 150-line modularity rule. AGENTS.md's 200-line emergency ceiling is
// not an automatic escape hatch; exceptions must be pre-approved as explicit policy.

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

const EXCLUDED_EXACT_FILES = new Set([
  'bun.lockb',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);

const EXCLUDED_PREFIXES = [
  '.next/',
  'apps/web/.next/',
  'apps/web/playwright-report/',
  'apps/web/test-results/',
  'build/',
  'coverage/',
  'dist/',
  'docs/plans/',
  'node_modules/',
  'packages/database/drizzle/',
];

const EXCLUDED_SEGMENTS = new Set(['.next', 'build', 'coverage', 'dist', 'node_modules']);

export function toPolicyPath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\/+/, '');
}

export function isCheckedTextFile(filePath) {
  const relPath = toPolicyPath(filePath);
  if (relPath.endsWith('.d.ts')) return false;
  return CHECKED_TEXT_EXTENSIONS.has(`.${relPath.split('.').pop()}`);
}

export function isExplicitModularityException(filePath) {
  const relPath = toPolicyPath(filePath);
  if (EXCLUDED_EXACT_FILES.has(relPath)) return true;
  if (EXCLUDED_PREFIXES.some(prefix => relPath.startsWith(prefix))) return true;
  if (relPath.startsWith('apps/web/public/icon-')) return true;
  return relPath.split('/').some(segment => EXCLUDED_SEGMENTS.has(segment));
}

// Files at or below the limit may not cross it; legacy files already above it may not grow.
export function isModularityChecked(filePath) {
  return isCheckedTextFile(filePath) && !isExplicitModularityException(filePath);
}
