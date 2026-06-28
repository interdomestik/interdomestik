import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildHostsEntry,
  ensureLocalTestHosts,
  LOCAL_TEST_HOSTS,
  missingHosts,
  nonLoopbackHosts,
} from './ensure-local-test-hosts.mjs';

test('local test host set covers current compatibility E2E hosts', () => {
  assert.deepEqual(LOCAL_TEST_HOSTS, [
    '127.0.0.1.nip.io',
    'app.127.0.0.1.nip.io',
    'ida.127.0.0.1.nip.io',
    'ks.127.0.0.1.nip.io',
    'mk.127.0.0.1.nip.io',
    'al.127.0.0.1.nip.io',
    'pilot.127.0.0.1.nip.io',
  ]);
});

test('missingHosts returns only hostnames absent from the hosts file text', () => {
  const existing = '127.0.0.1 localhost ks.127.0.0.1.nip.io\n';
  assert.deepEqual(missingHosts(existing, ['ks.127.0.0.1.nip.io', 'mk.127.0.0.1.nip.io']), [
    'mk.127.0.0.1.nip.io',
  ]);
});

test('missingHosts ignores hostnames that only appear in comments', () => {
  const existing = '127.0.0.1 localhost\n# ks.127.0.0.1.nip.io\n';
  assert.deepEqual(missingHosts(existing, ['ks.127.0.0.1.nip.io']), [
    'ks.127.0.0.1.nip.io',
  ]);
});

test('missingHosts requires an active loopback mapping', () => {
  const existing = '192.0.2.10 ks.127.0.0.1.nip.io\n';
  assert.deepEqual(missingHosts(existing, ['ks.127.0.0.1.nip.io']), [
    'ks.127.0.0.1.nip.io',
  ]);
  assert.deepEqual(nonLoopbackHosts(existing, ['ks.127.0.0.1.nip.io']), [
    'ks.127.0.0.1.nip.io',
  ]);
});

test('ensureLocalTestHosts appends missing hosts idempotently', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-hosts-'));
  const hostsPath = path.join(dir, 'hosts');
  fs.writeFileSync(hostsPath, '127.0.0.1 localhost\n');

  const first = await ensureLocalTestHosts({
    hostsPath,
    hosts: ['ks.127.0.0.1.nip.io', 'pilot.127.0.0.1.nip.io'],
    required: true,
  });
  const second = await ensureLocalTestHosts({
    hostsPath,
    hosts: ['ks.127.0.0.1.nip.io', 'pilot.127.0.0.1.nip.io'],
    required: true,
  });

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.match(buildHostsEntry(['pilot.127.0.0.1.nip.io']), /127\.0\.0\.1 pilot/u);
  assert.deepEqual(missingHosts(fs.readFileSync(hostsPath, 'utf8'), LOCAL_TEST_HOSTS), [
    '127.0.0.1.nip.io',
    'app.127.0.0.1.nip.io',
    'ida.127.0.0.1.nip.io',
    'mk.127.0.0.1.nip.io',
    'al.127.0.0.1.nip.io',
  ]);
});

test('ensureLocalTestHosts fails required mode on stale non-loopback mappings', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-hosts-'));
  const hostsPath = path.join(dir, 'hosts');
  fs.writeFileSync(hostsPath, '192.0.2.10 ks.127.0.0.1.nip.io\n');

  await assert.rejects(
    () =>
      ensureLocalTestHosts({
        hostsPath,
        hosts: ['ks.127.0.0.1.nip.io'],
        required: true,
      }),
    /hosts mapped to non-loopback addresses: ks\.127\.0\.0\.1\.nip\.io/u
  );
});

test('ensureLocalTestHosts logs only hosts appended after local DNS filtering', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-hosts-'));
  const hostsPath = path.join(dir, 'hosts');
  fs.writeFileSync(hostsPath, '127.0.0.1 base\n');

  const logs = [];
  const originalLog = console.log;
  console.log = message => logs.push(String(message));
  try {
    const result = await ensureLocalTestHosts({
      hostsPath,
      hosts: ['localhost', 'interdomestik.invalid'],
      required: false,
    });

    assert.equal(result.changed, true);
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(logs, ['[local-test-hosts] added interdomestik.invalid']);
  assert.match(fs.readFileSync(hostsPath, 'utf8'), /interdomestik\.invalid/u);
});
