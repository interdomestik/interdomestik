import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sha256Hex } from '../verify-machine-marker.mjs';

const begin = 'node scripts/ci/verify-machine.mjs begin pr-verify';
const stamp = 'node scripts/ci/verify-machine.mjs stamp pr-verify';
const browser = 'node scripts/run-with-default-db-url.mjs pnpm';
const security = 'node scripts/ci/verify-machine.mjs';

export const M5_SCRIPT = 'pr:verify:m5-evidence';
export const M4_SCRIPT = 'pr:verify:composed';
export const SECURITY_CHAIN =
  `${security} begin security-guard && node scripts/security-guard.mjs && ${security} stamp security-guard`;

// A lane transcript is required for every command. The purity checker also writes a native report.
// The full E2E gate builds the standalone artifact it serves, via scripts/m4-gatekeeper.sh.
export const MANIFEST = Object.freeze([
  ['m4', 'begin', begin],
  ['m5', 'repo-size', 'pnpm repo:size:check'],
  ['m5', 'contracts', 'pnpm test:ci:contracts:parallel'],
  ['m5', 'release', 'pnpm test:release-gate'],
  ['m5', 'e2e-contracts', 'pnpm check:e2e-contracts'],
  ['m5', 'production-warnings', 'pnpm lint:production-warnings'],
  ['m5', 'migration-journal', 'pnpm db:migrations:check-journal'],
  ['m4', 'rls', 'pnpm db:rls:test:required'],
  ['m5', 'i18n', 'pnpm i18n:check'],
  ['m5', 'i18n-purity', 'pnpm i18n:purity:check', 'tmp/i18n-purity/report.json'],
  ['m5', 'tenant-guard', 'pnpm check:tenant-guard'],
  ['m5', 'architecture', 'pnpm check:architecture-boundaries'],
  ['m4', 'coverage', 'pnpm coverage:gate'],
  ['m4', 'standalone-build-and-full-e2e', `${browser} e2e:gate`],
  ['m4', 'smoke', `${browser} e2e:smoke`],
  ['m4', 'stamp', stamp],
].map(Object.freeze));

export const DELEGATED = Object.freeze(MANIFEST.filter(([role]) => role === 'm5'));
export const FULL_CHAIN = MANIFEST.map(([, , command]) => command).join(' && ');
export const COMPOSED_CHAIN = [
  begin,
  'pnpm security:guard',
  ...MANIFEST.filter(([role, id]) => role === 'm4' && !['begin', 'stamp'].includes(id))
    .map(([, , command]) => command),
  stamp,
].join(' && ');
export const M5_CHAIN = 'node scripts/ci/verification-evidence/m5.mjs';
export const MANIFEST_SHA256 = sha256Hex(
  JSON.stringify({ lanes: MANIFEST, composed: COMPOSED_CHAIN, security: SECURITY_CHAIN, m5: M5_CHAIN })
);

export function checkManifest(root, { historical = false } = {}) {
  const { scripts } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (
    scripts['pr:verify'] !== FULL_CHAIN ||
    scripts['security:guard'] !== SECURITY_CHAIN ||
    (!historical && (scripts[M4_SCRIPT] !== COMPOSED_CHAIN || scripts[M5_SCRIPT] !== M5_CHAIN))
  ) {
    throw new Error('manifest');
  }
}
