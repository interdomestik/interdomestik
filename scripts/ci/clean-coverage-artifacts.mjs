import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.resolve(scriptDir, '../..');

function removeCoverageDir(rootDir, relativePath) {
  fs.rmSync(path.join(rootDir, relativePath, 'coverage'), {
    force: true,
    recursive: true,
  });
}

function ensureCoverageTmpDir(rootDir, relativePath) {
  fs.mkdirSync(path.join(rootDir, relativePath, 'coverage', '.tmp'), {
    recursive: true,
  });
}

export function cleanCoverageArtifacts({ rootDir = defaultRootDir } = {}) {
  removeCoverageDir(rootDir, 'apps/web');
  ensureCoverageTmpDir(rootDir, 'apps/web');
  removeCoverageDir(rootDir, 'packages/shared-auth');
  ensureCoverageTmpDir(rootDir, 'packages/shared-auth');

  for (const entry of fs.readdirSync(path.join(rootDir, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('domain-')) {
      continue;
    }

    removeCoverageDir(rootDir, path.join('packages', entry.name));
    ensureCoverageTmpDir(rootDir, path.join('packages', entry.name));
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === fileURLToPath(import.meta.url)) {
  cleanCoverageArtifacts();
}
