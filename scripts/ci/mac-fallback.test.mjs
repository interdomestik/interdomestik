import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  MAC_FALLBACK_EXECUTOR,
  macFallbackDisposition,
  validatedSshHost,
} from './mac-fallback-lib.mjs';

const now = Date.parse('2026-07-24T10:00:00.000Z');
const ready = {
  authorizedBy: 'user',
  authorizedAt: '2026-07-24T09:55:00.000Z',
  z620Reachable: false,
  dockerReady: true,
  clean: true,
  sha: 'e12ea1ae2207468cc839d8ceb0280eeea0524fe8',
  platform: 'darwin',
  arch: 'arm64',
  fallbackPortsFree: true,
  fallbackPorts: [55321, 55322, 55323, 3200],
};

test('fresh manual authorization allows diagnostic-only Mac fallback', () => {
  const result = macFallbackDisposition(ready, { now });
  assert.equal(result.status, 'allowed');
  assert.equal(result.executor, MAC_FALLBACK_EXECUTOR);
  assert.equal(result.pushPermitEligible, false);
  assert.deepEqual(result.problems, []);
});

test('fallback fails closed when primary reachability is available or unknown', () => {
  assert.deepEqual(macFallbackDisposition({ ...ready, z620Reachable: true }, { now }).problems, [
    'primary_available',
  ]);
  assert.deepEqual(macFallbackDisposition({ ...ready, z620Reachable: null }, { now }).problems, [
    'primary_reachability_unknown',
  ]);
});

test('stale authorization, Docker outage and port collision deny fallback', () => {
  const result = macFallbackDisposition(
    {
      ...ready,
      authorizedAt: '2026-07-24T08:00:00.000Z',
      dockerReady: false,
      fallbackPortsFree: false,
    },
    { now }
  );
  assert.deepEqual(result.problems, [
    'authorization_expired',
    'docker_unavailable',
    'fallback_ports_unavailable',
  ]);
});

test('baseline tunnel ports can never be selected as fallback ports', () => {
  const result = macFallbackDisposition(
    { ...ready, fallbackPorts: [54321, 55322, 55323, 3200] },
    { now }
  );
  assert.deepEqual(result.problems, ['baseline_port_overlap:54321']);
});

test('invalid fallback ports fail closed before listener probing', () => {
  const result = macFallbackDisposition(
    { ...ready, fallbackPorts: [0, 55322, 55323, Number.NaN] },
    { now }
  );
  assert.deepEqual(result.problems, ['invalid_fallback_ports']);
});

test('diagnostic preflight has no service mutation or permit capability', () => {
  const source = fs.readFileSync(new URL('./mac-fallback-preflight.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(
    source,
    /issuePermit|push-permit|docker\s+(start|stop)|open\s+-a|kill|supabase\s+start/iu
  );
  assert.match(source, /macFallbackDisposition/u);
});

test('diagnostic preflight rejects SSH option injection before probing the host', () => {
  const source = fs.readFileSync(new URL('./mac-fallback-preflight.mjs', import.meta.url), 'utf8');
  assert.equal(validatedSshHost('interdomestik-z620.local'), 'interdomestik-z620.local');
  assert.throws(() => validatedSshHost('-oProxyCommand=touch /tmp/pwned'), /Invalid SSH host/);
  assert.match(source, /validatedSshHost/u);
  assert.match(source, /MAC_EXECUTABLES\.ssh[\s\S]*?'--',[\s\S]*?host/u);
});
