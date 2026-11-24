import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const billing = path.join(root, 'packages/domain-membership-billing');
export const legacyRevision = 'bc19469b5479f47b63eab258249984a974d26199';

export function runLegacyUpgrade(run = execFileSync) {
  const source = mkdtempSync(path.join(tmpdir(), 'wp07-legacy.'));
  const quiet = { cwd: root, stdio: 'ignore' };
  let phase = 'cloning the local repository';
  try {
    run('git', ['clone', '--quiet', '--shared', '--no-checkout', root, source], quiet);
    phase = 'checking out the pinned revision';
    run('git', ['-C', source, 'checkout', '--quiet', '--detach', legacyRevision], quiet);
    phase = 'installing the legacy dependencies';
    run(
      'pnpm',
      ['--dir', source, 'install', '--frozen-lockfile', '--prefer-offline', '--ignore-scripts'],
      quiet
    );
    phase = 'running the PostgreSQL 16 upgrade proof';
    // Keep this input in the proof process so the parent Mac verifier still sees the gate environment.
    run('tsx', ['--test', '--test-concurrency=1', 'test/exchange-rates-upgrade.test.ts'], {
      cwd: billing,
      env: { ...process.env, REQUIRE_RLS_INTEGRATION: '1', WP07_LEGACY_SOURCE: source },
      stdio: 'inherit',
    });
  } catch {
    throw new Error(`WP-07 legacy upgrade failed while ${phase}.`);
  } finally {
    rmSync(source, { force: true, recursive: true });
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === import.meta.filename) {
  runLegacyUpgrade();
}
