import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspectRepositoryParity } from './main-e2e-reuse.mjs';
import { readLocalGitObjectId } from './main-e2e-reuse-github.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXPECTED_E2E_TREE = '9ef1cb4b99bdba458fffec42ff0e6e4284eceb1a';
const sourceFiles = {
  ciWorkflow: '.github/workflows/ci.yml',
  laneSource: 'scripts/run-e2e-lane.mjs',
  packageJson: 'package.json',
  playwrightConfig: 'apps/web/playwright.config.ts',
  prWorkflow: '.github/workflows/e2e-pr.yml',
};

test('new-account OTP secure save preserves current corpus parity', () => {
  const e2eTreeSha = readLocalGitObjectId(root, 'HEAD:apps/web/e2e');
  const sources = Object.fromEntries(
    Object.entries(sourceFiles).map(([key, file]) => [
      key,
      readFileSync(path.join(root, file), 'utf8'),
    ])
  );
  assert.equal(e2eTreeSha, EXPECTED_E2E_TREE);
  assert.equal(inspectRepositoryParity({ ...sources, e2eTreeSha }).commandChain, true);
});
