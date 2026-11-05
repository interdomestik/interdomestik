import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

import { collectorEnv } from './runtime-attestation/isolated-collect.mjs';
import { MODES } from './runtime-attestation/receipt.mjs';

// U2-e wiring contract. In `observe` mode the collector runs inside the staging release-gate step
// on the immutable deployment, before the gate, with an allowlisted environment; its receipt is
// published with the staging evidence and never changes the gate's outcome. Switching to `enforce`
// is a reviewed change that must also wire the verdict into staging acceptance and rollback.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = yaml.load(fs.readFileSync(path.join(rootDir, '.github/workflows/cd.yml'), 'utf8'));
const job = workflow.jobs['e2e-staging'];
const step = job.steps.find(candidate => candidate.name === 'Run Staging Release Gate');
const upload = job.steps.find(
  candidate => candidate.name === 'Upload staging verification artifacts'
);
const OBSERVER = ['RUNTIME_ATTESTATION_OBSERVER_EMAIL', 'RUNTIME_ATTESTATION_OBSERVER_PASSWORD'];

test('U2-e: the collector observes the exact immutable staging deployment of this commit', () => {
  assert.equal(
    step.env.RUNTIME_ATTESTATION_HOSTNAME,
    '${{ needs.deploy-staging.outputs.hostname }}'
  );
  assert.equal(step.env.EXPECTED_COMMIT_SHA, '${{ github.sha }}');
  assert.equal(step.env.RUNTIME_ATTESTATION_CANONICAL_HOST, 'staging.interdomestik.com');
  assert.equal(job.environment.name, 'staging');
  assert.deepEqual(job.permissions, { contents: 'read' });
});

test('U2-e: observe mode is explicit and the receipt is published with the staging evidence', () => {
  assert.ok(MODES.includes(step.env.RUNTIME_ATTESTATION_MODE));
  assert.equal(step.env.RUNTIME_ATTESTATION_MODE, 'observe');
  assert.equal(
    step.env.RUNTIME_ATTESTATION_RECEIPT_PATH,
    `${job.env.EVIDENCE_DIR}/runtime-attestation/receipt.json`
  );
  assert.equal(upload.if, 'always()');
  assert.equal(upload.with.path, '${{ env.EVIDENCE_DIR }}/**');
  assert.equal(upload.with['if-no-files-found'], 'error');
  for (const s of job.steps) assert.equal(s['continue-on-error'], undefined, s.name);
});

test('U2-e: the collector runs first, the gate always runs and keeps its own status', () => {
  const commands = step.run.split(/;\s*/u);
  const collect = commands.findIndex(c => c.includes('runtime-attestation/isolated-collect.mjs'));
  const gate = commands.findIndex(c => c.includes('release:gate:raw'));
  assert.ok(commands[0].startsWith('set -euo pipefail'));
  assert.ok(collect > 0 && collect < gate);
  assert.match(commands[collect], /\|\| attestation_status=\$\?$/u);
  assert.equal(commands.at(-1).trim(), 'exit "${attestation_status}"');
  // The gate never receives the observer account.
  for (const name of OBSERVER) assert.ok(commands[gate].includes(`-u ${name}`), name);
});

test('U2-e: observer secrets live only in this step; the collector sees an allowlist', () => {
  for (const name of OBSERVER) assert.equal(step.env[name], `\${{ secrets.${name} }}`, name);
  const text = yaml.dump(workflow);
  for (const name of OBSERVER)
    assert.equal(text.split(`secrets.${name}`).length - 1, 1, `${name} appears once`);
  const env = collectorEnv({
    ...Object.fromEntries(Object.keys(job.env).map(name => [name, 'x'])),
    ...Object.fromEntries(Object.keys(step.env).map(name => [name, 'x'])),
  });
  assert.deepEqual(
    Object.keys(env).filter(name => name.startsWith('RELEASE_GATE_')),
    []
  );
  for (const name of [...OBSERVER, 'VERCEL_AUTOMATION_BYPASS_SECRET', 'RUNTIME_ATTESTATION_MODE'])
    assert.ok(name in env, name);
  assert.ok(!('DATABASE_URL' in collectorEnv({ DATABASE_URL: 'x' })));
});
