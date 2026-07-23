import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { validateSentrySourceMaps } from './z620-sentry-sourcemaps.mjs';

const sha = '31a20e2e672367caa2cc54131f2c36d637c69dfe';

function fixture(t, clientSource) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'z620-sentry-maps-'));
  const buildDirectory = path.join(root, '.next');
  const clientDirectory = path.join(buildDirectory, 'static', 'chunks');
  const serverDirectory = path.join(buildDirectory, 'server');
  fs.mkdirSync(clientDirectory, { recursive: true });
  fs.mkdirSync(serverDirectory, { recursive: true });
  fs.writeFileSync(path.join(clientDirectory, 'client.js'), clientSource);
  fs.writeFileSync(
    path.join(clientDirectory, 'client.js.map'),
    JSON.stringify({ version: 3, sources: ['client.ts'], mappings: '' })
  );
  fs.writeFileSync(path.join(serverDirectory, 'server.js'), `globalThis._sentryRelease=${sha}`);
  fs.writeFileSync(
    path.join(serverDirectory, 'server.js.map'),
    JSON.stringify({ version: 3, sources: ['server.ts'], mappings: '' })
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return buildDirectory;
}

test('accepts complete hidden maps bound to the exact release SHA', t => {
  const buildDirectory = fixture(t, `globalThis._sentryRelease=${sha}`);
  const result = validateSentrySourceMaps({ buildDirectory, expectedSha: sha });

  assert.equal(result.status, 'pass');
  assert.equal(result.mapCount, 2);
  assert.equal(result.clientMapCount, 1);
  assert.equal(result.exposedClientSourceMappingUrls, 0);
  assert.equal(result.jsFilesWithExactRelease, 2);
  assert.deepEqual(result.problems, []);
});

test('rejects a public sourceMappingURL and a non-exact release', t => {
  const buildDirectory = fixture(
    t,
    `globalThis._sentryRelease=${sha}\n//# sourceMappingURL=client.js.map`
  );
  const result = validateSentrySourceMaps({
    buildDirectory,
    expectedSha: sha.slice(0, 12),
  });

  assert.equal(result.status, 'fail');
  assert.equal(result.exposedClientSourceMappingUrls, 1);
  assert.deepEqual(result.problems, [
    'invalid_release_sha',
    'public_source_map_references',
    'missing_exact_release',
  ]);
});

test('accepts a server map referenced by a differently named Next.js bundle', t => {
  const buildDirectory = fixture(t, `globalThis._sentryRelease=${sha}`);
  const serverDirectory = path.join(buildDirectory, 'server');
  fs.writeFileSync(
    path.join(serverDirectory, 'middleware.js'),
    `globalThis._sentryRelease=${sha}\n//# sourceMappingURL=proxy.js.map`
  );
  fs.writeFileSync(
    path.join(serverDirectory, 'proxy.js.map'),
    JSON.stringify({ version: 3, sources: ['proxy.ts'], mappings: '' })
  );

  const result = validateSentrySourceMaps({ buildDirectory, expectedSha: sha });

  assert.equal(result.status, 'pass');
  assert.equal(result.mapCount, 3);
  assert.deepEqual(result.problems, []);
});
