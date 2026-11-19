// Isolated children, the permission model, one Docker endpoint, describe diagnostics, the record
// directory and once-only publication.
import assert from 'node:assert/strict';
import test from 'node:test';

import { describeMachine } from './verify-machine-describe.mjs';
import {
  containerIdByName,
  parseDatabaseNames,
  parseLocalEndpoint,
  probeDocker,
} from './verify-machine-docker.mjs';
import { runIsolated } from './verify-machine-exec.mjs';
import { fixtureLive } from './verify-machine-fixtures.mjs';
import { harness } from './verify-machine-harness.mjs';
import { publishRecord, recordDirectory } from './verify-machine-records.mjs';
import { runVerifyMachine } from './verify-machine.mjs';

test('an isolated child receives an empty environment, coverage settings included', () => {
  const saved = process.env.NODE_V8_COVERAGE;
  process.env.NODE_V8_COVERAGE = '/nonexistent/coverage-sentinel';
  try {
    assert.equal(runIsolated('/usr/bin/env', []), '');
  } finally {
    if (saved === undefined) delete process.env.NODE_V8_COVERAGE;
    else process.env.NODE_V8_COVERAGE = saved;
  }
});

test('the verifier refuses the Node permission model before starting anything', () => {
  const h = harness();
  h.deps.permissionModel = true;
  h.deps.readMarker = () => assert.fail('no marker check under the permission model');
  for (const argv of [['begin', 'pr-verify'], ['stamp', 'pr-verify'], ['describe']]) {
    assert.equal(runVerifyMachine(argv, h.deps), 1);
  }
  assert.match(h.output.error[0], /does not run under the Node permission model/u);
  assert.deepEqual(h.files(), []);
  h.cleanup();
});

test('the record directory comes from the account, never from HOME or XDG_STATE_HOME', () => {
  assert.equal(
    recordDirectory({ platform: 'darwin', home: '/Users/x' }),
    '/Users/x/Library/Logs/interdomestik-verify'
  );
  assert.equal(
    recordDirectory({ platform: 'linux', home: '/home/x', env: { XDG_STATE_HOME: '/elsewhere' } }),
    '/home/x/.local/state/interdomestik-verify'
  );
});

test('Docker is probed through one local socket, the container by its exact name', () => {
  assert.equal(
    parseLocalEndpoint('"unix:///Users/x/.orbstack/run/docker.sock"'),
    'unix:///Users/x/.orbstack/run/docker.sock'
  );
  for (const remote of ['"ssh://host"', '"tcp://10.0.0.2:2376"', '"unix://"', 'null', 'oops']) {
    assert.equal(parseLocalEndpoint(remote), null, remote);
  }
  const id = 'b'.repeat(64);
  const listing = `${'a'.repeat(64)}\tida-mac-verify-pg-old\n${id}\tother,ida-mac-verify-pg`;
  assert.equal(containerIdByName(listing, 'ida-mac-verify-pg'), id);
  assert.equal(containerIdByName(listing, 'ida-mac-verify'), null);
  assert.deepEqual(parseDatabaseNames('["a","b"]'), ['a', 'b']);
  for (const output of ['a\nb', '[1]', '{"a":1}', '', null]) {
    assert.equal(parseDatabaseNames(output), null, String(output));
  }

  const calls = [];
  const exec = (command, args) => {
    calls.push(args.join(' '));
    if (args[0] === 'context' && args[1] === 'show') return 'remote-ctx';
    if (args[0] === 'context') return '"ssh://builder.example"';
    return assert.fail(`no Docker call may follow a remote endpoint: ${args.join(' ')}`);
  };
  const remote = probeDocker(exec, 'ida-mac-verify-pg', '/repo');
  assert.deepEqual(remote.container, { context: 'remote-ctx', localSocket: false, engine: null });
  assert.equal(remote.database, null);
  assert.deepEqual(calls, [
    'context show',
    'context inspect remote-ctx --format {{json .Endpoints.docker.Host}}',
  ]);
});

test('describe names the option, never the value, when the machine does not fit', () => {
  const secret = 'Synthetic_Secret_Value-1';
  const run = live => {
    const output = [];
    const deps = {
      cwd: '/repo',
      exec: () => '/repo',
      now: () => '2026-11-19T10:00:00.000Z',
      probe: () => live,
      log: line => output.push(line),
      error: line => output.push(line),
    };
    const code = describeMachine([`--db-name=${secret}`, `--container=${secret}`], deps);
    return { code, text: output.join('\n') };
  };
  const base = fixtureLive();
  for (const [live, message] of [
    [{ ...base, container: { ...base.container, localSocket: false } }, /local socket/u],
    [{ ...base, database: null }, /--container value names no container/u],
    [{ ...base, database: { ...base.database, running: false } }, /stopped container/u],
    [{ ...base, databaseNames: ['postgres'] }, /--db-name value is not a database/u],
    [{ ...base, databaseNames: null }, /--db-name value is not a database/u],
  ]) {
    const { code, text } = run(live);
    assert.equal(code, 1);
    assert.match(text, message);
    assert.ok(!text.includes(secret), 'an operator value is never printed');
  }
});

test('publication writes a new temporary file and keeps the link error over a cleanup error', () => {
  const calls = [];
  const fs = ({ link = null, rm = null } = {}) => ({
    mkdirSync: () => {},
    writeFileSync: (name, text, options) => calls.push(['write', options.flag, name]),
    linkSync: () => {
      if (link) throw Object.assign(new Error(link), { code: link });
    },
    rmSync: () => {
      if (rm) throw Object.assign(new Error(rm), { code: rm });
    },
  });
  const warnings = [];
  const warn = error => warnings.push(error.code);
  assert.throws(() => publishRecord('/r/x.json', {}, warn, fs({ link: 'EEXIST', rm: 'EACCES' })), {
    code: 'EEXIST',
  });
  assert.deepEqual(warnings, []);
  assert.match(publishRecord('/r/x.json', {}, warn, fs({ rm: 'EACCES' })), /^[0-9a-f]{64}$/u);
  assert.deepEqual(warnings, ['EACCES']);
  assert.ok(calls.every(([, flag]) => flag === 'wx'));
  assert.notEqual(calls[0][2], calls[1][2], 'each publication uses a new temporary name');
});
