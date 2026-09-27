import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';
import test from 'node:test';

import { requestVercelHealth } from './fetch-vercel-health.mjs';

test('requestVercelHealth forces IPv4 only for the opted-in staging process', async () => {
  const calls = [];
  const execFileImpl = async (file, args) => {
    calls.push({ file, args });
    return { stdout: '{}\n__INTERDOMESTIK_HEALTH_STATUS__:200' };
  };
  const url = new URL('https://interdomestik-web-git-main-ecohub.vercel.app/api/health');

  await requestVercelHealth(url, {}, 1_000, execFileImpl, {
    INTERDOMESTIK_VERCEL_IPV4_ONLY: '1',
  });
  await requestVercelHealth(url, {}, 1_000, execFileImpl, {});

  assert.equal(calls[0].file, 'curl');
  assert.equal(calls[0].args.includes('--ipv4'), true);
  assert.equal(calls[0].args.includes('--silent'), true);
  assert.equal(calls[0].args.at(-1), url.href);
  assert.equal(calls[1].args.includes('--ipv4'), false);
});

test('requestVercelHealth keeps the bypass secret out of command errors and removes its header file', async () => {
  const secret = 'dummy-bypass-value-never-log';
  let headerPath;
  const execFileImpl = async (_file, args) => {
    assert.doesNotMatch(args.join(' '), new RegExp(secret, 'u'));
    const headerIndex = args.indexOf('--header');
    assert.notEqual(headerIndex, -1);
    assert.match(args[headerIndex + 1], /^@/u);
    headerPath = args[headerIndex + 1].slice(1);
    assert.equal(await readFile(headerPath, 'utf8'), `x-vercel-protection-bypass: ${secret}\n`);
    assert.equal((await stat(headerPath)).mode & 0o777, 0o600);
    const error = new Error(`Command failed: curl ${args.join(' ')}`);
    error.code = 28;
    error.stderr = `${'x'.repeat(1_190)}${secret}`;
    throw error;
  };
  const url = new URL('https://interdomestik-web-git-main-ecohub.vercel.app/api/health');

  await assert.rejects(
    requestVercelHealth(url, { 'x-vercel-protection-bypass': secret }, 1_000, execFileImpl, {
      INTERDOMESTIK_VERCEL_IPV4_ONLY: '1',
    }),
    error => {
      assert.match(error.message, /Health request transport failed.*28/u);
      assert.doesNotMatch(error.message, new RegExp(secret, 'u'));
      assert.doesNotMatch(error.message, /dummy-byp/u);
      return true;
    }
  );
  await assert.rejects(access(headerPath));
});
