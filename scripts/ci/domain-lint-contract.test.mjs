import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import packageJson from '../../package.json' with { type: 'json' };

const root = fileURLToPath(new URL('../..', import.meta.url));
const runner = fs.readFileSync(path.join(root, 'scripts/ci/lint-domains.mjs'), 'utf8');

test('canonical lint includes every domain source tree through the shared rules', () => {
  assert.match(packageJson.scripts.lint, /pnpm lint:domains/);
  assert.equal(packageJson.scripts['lint:domains'], 'node scripts/ci/lint-domains.mjs');
  assert.match(runner, /startsWith\('domain-'\)/);
  assert.match(runner, /path\.join\('packages', entry\.name, 'src'\)/);
  assert.match(runner, /packages\/shared-logging\/eslint\.config\.mjs/);
});

test('domain lint evaluates warning rules but emits only blocking errors as annotations', () => {
  assert.match(runner, /eslint\.lintFiles/);
  assert.match(runner, /ESLint\.getErrorResults\(results\)/);
  assert.match(runner, /result\.warningCount/);
  assert.doesNotMatch(runner, /quiet/);
});
