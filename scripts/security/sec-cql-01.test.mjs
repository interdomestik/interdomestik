import assert from 'node:assert/strict';
import test from 'node:test';

import egress from './egress.cjs';
import safeCommand from './safe-command.cjs';

test('egress guard rejects loopback and private URL targets by default', () => {
  assert.throws(() => egress.assertSafeHttpUrl('http://127.0.0.1:3000/health'), {
    message: /unsafe egress url host/i,
  });
  assert.throws(() => egress.assertSafeHttpUrl('https://169.254.169.254/latest/meta-data'), {
    message: /unsafe egress url host/i,
  });
  assert.equal(
    egress.assertSafeHttpUrl('https://example.com/status').origin,
    'https://example.com'
  );
});

test('vercel deployment URL guard only accepts trusted deployment hosts', () => {
  assert.equal(
    egress.assertTrustedVercelDeploymentUrl('https://interdomestik-git-main.vercel.app').origin,
    'https://interdomestik-git-main.vercel.app'
  );
  assert.throws(() => egress.assertTrustedVercelDeploymentUrl('https://example.com'), {
    message: /not allowed/i,
  });
});

test('wrapper command guard accepts repo commands and rejects command payloads', () => {
  assert.equal(safeCommand.resolveAllowedCommand('pnpm'), 'pnpm');
  assert.equal(safeCommand.resolveAllowedCommand('bash', ['scripts/check.sh']), 'bash');
  assert.throws(() => safeCommand.resolveAllowedCommand('sh -c env'), {
    message: /unsupported wrapper command/i,
  });
  assert.throws(() => safeCommand.resolveAllowedCommand('/bin/bash'), {
    message: /unsupported wrapper command/i,
  });
  assert.throws(() => safeCommand.resolveAllowedCommand('bash', ['-c', 'env']), {
    message: /shell\/eval flag/i,
  });
  assert.throws(() => safeCommand.resolveAllowedCommand('node', ['--eval', 'process.exit(0)']), {
    message: /shell\/eval flag/i,
  });
});
