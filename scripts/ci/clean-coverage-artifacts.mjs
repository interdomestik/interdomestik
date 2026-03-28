import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');

function removeCoverageDir(relativePath) {
  fs.rmSync(path.join(rootDir, relativePath, 'coverage'), {
    force: true,
    recursive: true,
  });
}

function ensureCoverageTmpDir(relativePath) {
  fs.mkdirSync(path.join(rootDir, relativePath, 'coverage', '.tmp'), {
    recursive: true,
  });
}

removeCoverageDir('apps/web');
ensureCoverageTmpDir('apps/web');

for (const entry of fs.readdirSync(path.join(rootDir, 'packages'), { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('domain-')) {
    continue;
  }

  removeCoverageDir(path.join('packages', entry.name));
  ensureCoverageTmpDir(path.join('packages', entry.name));
}
