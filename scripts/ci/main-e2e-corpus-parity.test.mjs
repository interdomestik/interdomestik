import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspectRepositoryParity } from './main-e2e-reuse.mjs';
import { readLocalGitObjectId } from './main-e2e-reuse-github.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MEMBER_PORTAL_E2E_TREE = '5468dfaebd2e284d506eec07713ad5d2729f8711';
const read = file => readFileSync(path.join(root, file), 'utf8');
const sources = () => ({
  ciWorkflow: read('.github/workflows/ci.yml'),
  prWorkflow: read('.github/workflows/e2e-pr.yml'),
  laneSource: read('scripts/run-e2e-lane.mjs'),
  playwrightConfig: read('apps/web/playwright.config.ts'),
  packageJson: read('package.json'),
  e2eTreeSha: readLocalGitObjectId(root, 'HEAD:apps/web/e2e'),
});

test('repository parity recognizes an approved E2E corpus and rejects the new S7 corpus', () => {
  const current = sources();
  assert.deepEqual(inspectRepositoryParity({ ...current, e2eTreeSha: MEMBER_PORTAL_E2E_TREE }), {
    checkoutHead: true,
    projectSuperset: true,
    sharedFlags: true,
    databaseSubstrate: true,
    commandChain: true,
  });
  assert.equal(inspectRepositoryParity(current).commandChain, false);
});
test('T117C nonce assertion correction preserves corpus parity', () => {
  assert.equal(
    inspectRepositoryParity({
      ...sources(),
      e2eTreeSha: '110a4d174a4149f9c2eac14ad3e1aff848371d32',
    }).commandChain,
    true
  );
});
test('member upload locale continuity preserves corpus parity', () => {
  assert.equal(
    inspectRepositoryParity({
      ...sources(),
      e2eTreeSha: '469d483c0727f755a5dd27eb02f54192c484ebf6',
    }).commandChain,
    true
  );
});
test('S1 agent message visibility preserves corpus parity', () => {
  assert.equal(
    inspectRepositoryParity({
      ...sources(),
      e2eTreeSha: '8892fb8818e0d6861ac7d152249a4b15a5221890',
    }).commandChain,
    true
  );
});
test('S2 branch overview scope protection preserves corpus parity', () => {
  assert.equal(
    inspectRepositoryParity({
      ...sources(),
      e2eTreeSha: '354b38ebe3d79b06b994103aa63dc21baf2f5294',
    }).commandChain,
    true
  );
});
test('hardened S3 member-staff journey preserves corpus parity', () => {
  assert.equal(
    inspectRepositoryParity({
      ...sources(),
      e2eTreeSha: '18357bb3596c54b0aca7fdd9bf5db3a665b5a127',
    }).commandChain,
    true
  );
});
test('S4 missing-information request preserves corpus parity', () => {
  assert.equal(
    inspectRepositoryParity({
      ...sources(),
      e2eTreeSha: '985c4b06bf15b79b7690c2b5ff3c3f06890549dd',
    }).commandChain,
    true
  );
});
for (const [name, e2eTreeSha] of [
  ['S5 explicit diaspora country context', 'cacb1feef816ded4c09ad3555e8831a248e24871'],
  ['S5 corridor preparation', 'cb5baacf61c72aa57f23a884ad5f865f9ee1f1ee'],
  ['S5 pack-status disclosure', 'f24e4a8e5d97bf5f77cd6f097c79758432622c30'],
]) {
  test(`${name} preserves historical corpus parity`, () => {
    const parity = inspectRepositoryParity({ ...sources(), e2eTreeSha });
    assert.ok(parity.commandChain, `the ${name} E2E tree must stay in the command chain`);
  });
}
test('member membership access disclosure preserves corpus parity', () => {
  assert.equal(
    inspectRepositoryParity({ ...sources(), e2eTreeSha: MEMBER_PORTAL_E2E_TREE }).commandChain,
    true
  );
});
