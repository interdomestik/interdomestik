import fs from 'node:fs';
import path from 'node:path';

export const repositoryRoot = path.resolve(import.meta.dirname, '../../../..');
export function copyProducer(sourceRoot, targetRoot) {
  const scripts = path.join(targetRoot, 'scripts/ci');
  fs.mkdirSync(scripts, { recursive: true });
  fs.cpSync(path.join(sourceRoot, 'scripts/ci/p2'), path.join(scripts, 'p2'), { recursive: true });
  for (const file of [
    'db-access-provider-runtime-identity.mjs',
    'db-access-git-blob-batch.mjs',
    'coverage-gate.mjs',
    'clean-coverage-artifacts.mjs',
  ])
    fs.copyFileSync(path.join(sourceRoot, 'scripts/ci', file), path.join(scripts, file));
}
