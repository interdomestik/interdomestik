import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Test helper: the inputs of the main E2E reuse resolver, with the PR workflow and lane runner read
// from their pre-split byte copies (pinned to the resolver's hashes by main-e2e-reuse-corpus.test.mjs).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const keyPairs =
  'ciWorkflow=.github/workflows/ci.yml|prWorkflow=.github/workflows/e2e-pr.yml|laneSource=scripts/run-e2e-lane.mjs|playwrightConfig=apps/web/playwright.config.ts|packageJson=package.json';
export const sourceKeys = Object.fromEntries(
  keyPairs.split('|').map(pair => pair.split('=').reverse())
);
export const historicalFiles = {
  '.github/workflows/e2e-pr.yml': 'scripts/ci/fixtures/main-e2e-reuse/e2e-pr.pre-split.yml.fixture',
  'scripts/run-e2e-lane.mjs':
    'scripts/ci/fixtures/main-e2e-reuse/run-e2e-lane.pre-split.mjs.fixture',
};
export const readRepoFile = file => readFileSync(path.join(root, file), 'utf8');
export const readHistorical = file => readRepoFile(historicalFiles[file] ?? file);
export const historicalSources = e2eTreeSha => ({
  ...Object.fromEntries(
    Object.entries(sourceKeys).map(([file, key]) => [key, readHistorical(file)])
  ),
  e2eTreeSha,
});
