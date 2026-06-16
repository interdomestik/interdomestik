import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import webPackageJson from '../apps/web/package.json' with { type: 'json' };

test('ida smoke lane is wired explicitly', () => {
  const e2eLaneRunner = readFileSync(
    new URL('../scripts/run-e2e-lane.mjs', import.meta.url),
    'utf8'
  );

  assert.match(e2eLaneRunner, /--project=smoke-ida/);
});

test('country-host state lane stays scoped to country aliases', () => {
  const e2eLaneRunner = readFileSync(
    new URL('../scripts/run-e2e-lane.mjs', import.meta.url),
    'utf8'
  );
  const setupArgsBlock = e2eLaneRunner.match(/const setupArgs = \[(?<body>[\s\S]*?)\];/);

  assert.ok(setupArgsBlock?.groups?.body);
  assert.doesNotMatch(setupArgsBlock.groups.body, /setup-ida-/);
});

test('ida smoke lane runs gatekeeper before Playwright', () => {
  const e2eLaneRunner = readFileSync(
    new URL('../scripts/run-e2e-lane.mjs', import.meta.url),
    'utf8'
  );
  const smokeLaneStart = e2eLaneRunner.indexOf("'smoke-ida':");
  const nextLaneStart = e2eLaneRunner.indexOf('\n  ks:', smokeLaneStart);

  assert.notEqual(smokeLaneStart, -1);
  assert.notEqual(nextLaneStart, -1);
  assert.match(e2eLaneRunner.slice(smokeLaneStart, nextLaneStart), /gatekeeper: true/);
});

test('production smoke remains distinct from ida.localhost smoke', () => {
  assert.equal(
    webPackageJson.scripts['e2e:smoke'],
    'playwright test --grep "@smoke" --project=ks-sq --project=mk-mk --workers=1'
  );
  assert.equal(
    webPackageJson.scripts['test:smoke'],
    "playwright test --project=smoke --grep '@smoke'"
  );
  assert.equal(
    webPackageJson.scripts['e2e:smoke:ida'],
    'playwright test --grep "@smoke" --project=smoke-ida --workers=1'
  );
  assert.equal(
    webPackageJson.scripts['test:smoke:ida'],
    "playwright test --project=smoke-ida --grep '@smoke'"
  );
});
