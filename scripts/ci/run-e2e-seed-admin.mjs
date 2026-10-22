import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { administrativeSeedProfile } from './e2e-administrative-profile.mjs';
export { administrativeSeedProfile } from './e2e-administrative-profile.mjs';

export function runAdministrativeSeed(mode, parent = process.env) {
  const { args, env } = administrativeSeedProfile(mode, parent);
  const result = spawnSync('pnpm', args, {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
    env,
    shell: false,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3)
    throw new Error('Expected one fixed administrative seed operation');
  process.exitCode = runAdministrativeSeed(process.argv[2]);
}
