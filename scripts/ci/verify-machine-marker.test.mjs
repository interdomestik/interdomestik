import assert from 'node:assert/strict';
import test from 'node:test';

import { fixtureMarker } from './verify-machine-fixtures.mjs';
import { sha256Hex, validateMarker } from './verify-machine-marker.mjs';
import { readTrustedMarker } from './verify-machine-trust.mjs';

const MARKER = '/Library/Application Support/Interdomestik/verify-machine.json';
const DIRECTORIES = [
  '/Library/Application Support/Interdomestik',
  '/Library/Application Support',
  '/Library',
  '/',
];
const FD = 7;

function stat({ uid = 0, mode = 0o644, kind = 'file', nlink = 1, ino = 11 } = {}) {
  return {
    uid,
    mode,
    nlink,
    dev: 1,
    ino,
    isFile: () => kind === 'file',
    isDirectory: () => kind === 'dir',
  };
}

const dir = options => stat({ kind: 'dir', mode: 0o755, ...options });

function fakeFs({ fileStat = stat(), dirs = {}, writable = [], opened, text, readError } = {}) {
  const bytes = Buffer.from(text ?? JSON.stringify(fixtureMarker()));
  return {
    bytes,
    lstatSync(target) {
      if (target === MARKER) {
        if (fileStat === null) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        return fileStat;
      }
      assert.ok(DIRECTORIES.includes(target), target);
      return dirs[target] ?? dir();
    },
    accessSync(target) {
      if (!writable.includes(target)) throw Object.assign(new Error('no'), { code: 'EACCES' });
    },
    openSync(target, flags) {
      assert.equal(target, MARKER);
      assert.ok(flags !== 0, 'opened with O_NOFOLLOW');
      return FD;
    },
    fstatSync: () => opened ?? fileStat,
    readFileSync(target) {
      assert.equal(target, FD, 'reads the checked descriptor, not the path');
      if (readError) throw Object.assign(new Error('io'), { code: readError });
      return bytes;
    },
    closeSync: () => {},
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

test('a protected marker is trusted and hashed from the checked descriptor', () => {
  const fs = fakeFs();
  const result = readTrustedMarker(MARKER, fs);
  assert.equal(result.status, 'trusted');
  assert.equal(result.sha256, sha256Hex(fs.bytes));
  assert.deepEqual(result.marker, fixtureMarker());
});

test('a marker the developer could write or swap is refused, never downgraded', () => {
  const parent = '/Library/Application Support';
  const cases = [
    [{ fileStat: stat({ uid: 501 }) }, 'marker file must be owned by root'],
    [{ fileStat: stat({ mode: 0o664 }) }, 'marker file must not be writable by group or others'],
    [{ fileStat: stat({ mode: 0o646 }) }, 'marker file must not be writable by group or others'],
    [{ fileStat: stat({ kind: 'link' }) }, 'marker file must be a regular file, not a link'],
    [{ fileStat: stat({ nlink: 2 }) }, 'marker file must have exactly one link'],
    [{ writable: [MARKER] }, 'marker file is writable by this user'],
    [
      { dirs: { [DIRECTORIES[0]]: dir({ uid: 501 }) } },
      `directory ${DIRECTORIES[0]} must be owned by root`,
    ],
    [
      { dirs: { [parent]: dir({ mode: 0o775 }) } },
      `directory ${parent} must not be writable by group or others`,
    ],
    [
      { dirs: { '/Library': dir({ kind: 'link' }) } },
      'directory /Library must be a directory, not a link',
    ],
    [{ writable: [parent] }, `directory ${parent} is writable by this user`],
    [{ opened: stat({ ino: 12 }) }, 'marker changed while it was checked'],
  ];
  for (const [options, message] of cases) {
    const result = readTrustedMarker(MARKER, fakeFs(options));
    assert.equal(result.status, 'invalid', message);
    assert.ok(result.errors.includes(message), `${message}: ${result.errors.join('; ')}`);
  }
});

test('an unreadable, non-JSON or incomplete marker is refused', () => {
  const denied = {
    lstatSync() {
      throw Object.assign(new Error('denied'), { code: 'EACCES' });
    },
  };
  assert.deepEqual(readTrustedMarker(MARKER, denied), {
    status: 'invalid',
    errors: ['marker cannot be read (EACCES)'],
  });
  assert.deepEqual(readTrustedMarker(MARKER, fakeFs({ readError: 'EIO' })), {
    status: 'invalid',
    errors: ['marker cannot be opened (EIO)'],
  });
  assert.deepEqual(readTrustedMarker(MARKER, fakeFs({ text: '{' })), {
    status: 'invalid',
    errors: ['marker is not valid JSON'],
  });
  const incomplete = readTrustedMarker(MARKER, fakeFs({ text: '{"schema":"x"}' }));
  assert.equal(incomplete.status, 'invalid');
  assert.ok(incomplete.errors.includes('missing field machine'));
});
