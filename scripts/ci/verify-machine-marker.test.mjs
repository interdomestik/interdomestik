import assert from 'node:assert/strict';
import test from 'node:test';

import { fixtureMarker } from './verify-machine-fixtures.mjs';
import { readTrustedMarker, sha256Hex, validateMarker } from './verify-machine-marker.mjs';

const MARKER = '/Library/Application Support/Interdomestik/verify-machine.json';
const DIRECTORY = '/Library/Application Support/Interdomestik';

function stat({ uid = 0, mode = 0o644, file = true } = {}) {
  return { uid, mode, isFile: () => file, isDirectory: () => !file };
}

function fakeFs({ fileStat = stat(), dirStat = stat({ file: false, mode: 0o755 }), text }) {
  const bytes = Buffer.from(text ?? JSON.stringify(fixtureMarker()));
  return {
    bytes,
    lstatSync(target) {
      if (target === MARKER) {
        if (fileStat === null) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        return fileStat;
      }
      assert.equal(target, DIRECTORY);
      return dirStat;
    },
    readFileSync(target) {
      assert.equal(target, MARKER);
      return bytes;
    },
  };
}

test('a complete marker validates', () => {
  assert.deepEqual(validateMarker(fixtureMarker()), []);
});

test('missing, unknown and malformed fields are each named', () => {
  const marker = fixtureMarker({ extra: true, node: '' });
  delete marker.pnpm;
  marker.database = { ...marker.database, port: 0 };
  assert.deepEqual(validateMarker(marker).sort(), [
    'invalid field database.port',
    'invalid field node',
    'missing field pnpm',
    'unknown field extra',
  ]);
  assert.deepEqual(validateMarker([]), ['marker must be an object']);
  assert.deepEqual(validateMarker(fixtureMarker({ machine: { arch: 'arm64' } })), [
    'missing field machine.hardware_uuid_sha256',
  ]);
});

test('the marker must forbid the shared ports and pin the database image', () => {
  const marker = fixtureMarker({ forbidden_ports: [3000], app_port: 3000 });
  marker.database = { ...marker.database, host: '10.0.0.5', image: 'postgres:16' };
  assert.deepEqual(validateMarker(marker), [
    'forbidden_ports must include 54322',
    'app_port is a forbidden port',
    'database.host must be loopback',
    'database.image must be pinned by digest',
  ]);
  const shared = fixtureMarker();
  shared.database = { ...shared.database, port: 54322 };
  assert.deepEqual(validateMarker(shared), ['database.port is a forbidden port']);
  assert.deepEqual(validateMarker(fixtureMarker({ schema: 'other/1', created_at: 'soon' })), [
    'schema must be interdomestik.verify-machine/1',
    'created_at is not a date',
  ]);
});

test('no marker file means a pre-check, not an error', () => {
  assert.deepEqual(readTrustedMarker(MARKER, fakeFs({ fileStat: null })), { status: 'absent' });
});

test('a root-owned, read-only marker is trusted and hashed byte for byte', () => {
  const fs = fakeFs({});
  const result = readTrustedMarker(MARKER, fs);
  assert.equal(result.status, 'trusted');
  assert.equal(result.sha256, sha256Hex(fs.bytes));
  assert.deepEqual(result.marker, fixtureMarker());
});

test('a marker the developer could write is refused, never downgraded to a pre-check', () => {
  const cases = [
    [{ fileStat: stat({ uid: 501 }) }, 'marker file must be owned by root'],
    [{ fileStat: stat({ mode: 0o664 }) }, 'marker file must not be writable by group or others'],
    [{ fileStat: stat({ mode: 0o646 }) }, 'marker file must not be writable by group or others'],
    [{ fileStat: stat({ file: false }) }, 'marker file must be a regular file, not a link'],
    [{ dirStat: stat({ file: false, uid: 501 }) }, 'marker directory must be owned by root'],
    [
      { dirStat: stat({ file: false, mode: 0o775 }) },
      'marker directory must not be writable by group or others',
    ],
  ];
  for (const [options, message] of cases) {
    const result = readTrustedMarker(MARKER, fakeFs(options));
    assert.equal(result.status, 'invalid', message);
    assert.ok(result.errors.includes(message), `${message}: ${result.errors.join('; ')}`);
  }
});

test('an unreadable, non-JSON or incomplete marker is refused', () => {
  const unreadable = {
    lstatSync() {
      throw Object.assign(new Error('denied'), { code: 'EACCES' });
    },
  };
  assert.deepEqual(readTrustedMarker(MARKER, unreadable), {
    status: 'invalid',
    errors: ['marker cannot be read (EACCES)'],
  });
  assert.deepEqual(readTrustedMarker(MARKER, fakeFs({ text: '{' })), {
    status: 'invalid',
    errors: ['marker is not valid JSON'],
  });
  const incomplete = readTrustedMarker(MARKER, fakeFs({ text: '{"schema":"x"}' }));
  assert.equal(incomplete.status, 'invalid');
  assert.ok(incomplete.errors.includes('missing field machine'));
});
