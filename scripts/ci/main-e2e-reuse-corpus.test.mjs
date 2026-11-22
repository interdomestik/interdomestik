import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspectRepositoryParity } from './main-e2e-reuse.mjs';
import { readLocalGitObjectId } from './main-e2e-reuse-github.mjs';
import { historicalFiles, historicalSources, readRepoFile } from './main-e2e-reuse-sources.mjs';

// Historical corpus parity for main E2E reuse. These cases read the pre-split PR workflow and lane
// runner (byte copies pinned to the resolver's hashes): the live split workflow is not admitted.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const E2E_TREE = readLocalGitObjectId(root, 'HEAD:apps/web/e2e');
const MEMBER_PORTAL_E2E_TREE = '5468dfaebd2e284d506eec07713ad5d2729f8711';
const sources = () => historicalSources(E2E_TREE);

test('pre-split fixtures match the resolver source pins byte for byte', () => {
  const resolver = readRepoFile('scripts/ci/main-e2e-reuse.mjs');
  for (const [file, pin] of [
    ['.github/workflows/e2e-pr.yml', 'PR_WORKFLOW_SHA256'],
    ['scripts/run-e2e-lane.mjs', 'LANE_SHA256'],
  ]) {
    const expected = resolver.match(new RegExp(`^const ${pin} = '([0-9a-f]{64})';$`, 'mu'))?.[1];
    assert.ok(expected, pin);
    const bytes = readFileSync(path.join(root, historicalFiles[file]));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected);
  }
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
for (const [name, e2eTreeSha] of [
  ['T117C nonce assertion correction', '110a4d174a4149f9c2eac14ad3e1aff848371d32'],
  ['member upload locale continuity', '469d483c0727f755a5dd27eb02f54192c484ebf6'],
  ['S1 agent message visibility', '8892fb8818e0d6861ac7d152249a4b15a5221890'],
  ['S2 branch overview scope protection', '354b38ebe3d79b06b994103aa63dc21baf2f5294'],
  ['hardened S3 member-staff journey', '18357bb3596c54b0aca7fdd9bf5db3a665b5a127'],
  ['S4 missing-information request', '985c4b06bf15b79b7690c2b5ff3c3f06890549dd'],
  ['S5 explicit diaspora country context', 'cacb1feef816ded4c09ad3555e8831a248e24871'],
  ['S5 corridor preparation', 'cb5baacf61c72aa57f23a884ad5f865f9ee1f1ee'],
  ['S5 pack-status disclosure', 'f24e4a8e5d97bf5f77cd6f097c79758432622c30'],
]) {
  test(`${name} preserves historical corpus parity`, () => {
    const parity = inspectRepositoryParity({ ...sources(), e2eTreeSha });
    assert.equal(parity.commandChain, true, `the ${name} E2E tree must stay in the command chain`);
  });
}
test('member membership access disclosure preserves corpus parity', () => {
  assert.equal(
    inspectRepositoryParity({ ...sources(), e2eTreeSha: MEMBER_PORTAL_E2E_TREE }).commandChain,
    true
  );
});
