import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkInvocation, validatePath } from './verification-evidence/worker.mjs';

function checkoutFixture(t) {
  const temp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'evidence-worker-')));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'checkout');
  const sibling = path.join(temp, 'checkout-other');
  mkdirSync(root);
  mkdirSync(sibling);
  return { root, sibling, temp };
}

test('worker invocation requires the supervisor checkout and enrolled tool paths', t => {
  const { root, sibling, temp } = checkoutFixture(t);
  const toolPath = '/opt/homebrew/bin:/usr/bin:/bin';
  const bashPath = '/opt/homebrew/Cellar/bash/5.3/bin/bash';
  const context = { root, toolPath, bashPath };
  const alias = path.join(temp, 'checkout-link');
  symlinkSync(root, alias);

  assert.doesNotThrow(() => checkInvocation([root, toolPath, bashPath], context));
  for (const wrongCheckout of ['.', `${root}/../checkout`, sibling, alias]) {
    assert.throws(
      () => checkInvocation([wrongCheckout, toolPath, bashPath], context),
      /worker isolation/u
    );
  }
  assert.throws(() => checkInvocation([root, sibling, bashPath], context), /worker isolation/u);
  assert.throws(() => checkInvocation([root, toolPath, '/bin/bash'], context), /worker isolation/u);
});

test('worker paths refuse traversal, sibling prefixes and symlink escapes', t => {
  const { root, sibling } = checkoutFixture(t);
  const scratch = path.join(root, 'tmp');
  mkdirSync(scratch);
  symlinkSync(sibling, path.join(root, 'outside'));
  symlinkSync(path.join(sibling, 'missing'), path.join(root, 'dangling'));
  symlinkSync(scratch, path.join(root, 'inside'));
  const optional = { allowMissing: true };

  assert.equal(validatePath('tmp', root), scratch);
  assert.equal(
    validatePath('tmp/m5-pnpm-store', root, optional),
    path.join(scratch, 'm5-pnpm-store')
  );
  assert.equal(validatePath('inside', root), path.join(root, 'inside'));
  assert.throws(() => validatePath('inside', root, { canonical: true }), /worker isolation/u);
  for (const outside of ['..', '../checkout-other', sibling, 'outside', 'outside/missing']) {
    assert.throws(() => validatePath(outside, root, optional), /worker isolation/u);
  }
  assert.throws(() => validatePath('dangling', root, optional), { code: 'ENOENT' });
});
