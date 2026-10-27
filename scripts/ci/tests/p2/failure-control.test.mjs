import { fileURLToPath } from 'node:url';
import { materializeP2Capsule } from '../../p2/capsule-layout.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateP2Observation } from '../../p2/observations.mjs';
test('actual coverage-enabled child fails deliberate assertion and collector refuses credit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p2-failure-capture-'));
  const source = new URL('../../p2/', import.meta.url);
  try {
    fs.rmdirSync(root);
    materializeP2Capsule(fileURLToPath(source), root);
    const file = path.join(root, 'wrapper.test.mjs'),
      text = fs.readFileSync(file, 'utf8');
    const needle = 'toHaveBeenCalledTimes(24)';
    assert.equal(text.split(needle).length, 2);
    fs.writeFileSync(file, text.replace(needle, 'toHaveBeenCalledTimes(25)'));
    const child = spawnSync(process.execPath, [path.join(root, 'run-suite.mjs')], {
      env: { PATH: '/usr/bin:/bin', TZ: 'UTC', LANG: 'C.UTF-8' },
      timeout: 12000,
      maxBuffer: 65536,
    });
    assert.equal(child.status, 1);
    const value = JSON.parse(child.stdout);
    assert.deepEqual(
      value.cases.filter(c => c.state === 'fail').map(c => c.name),
      ['revalidates every original locale path after committed changed assignment']
    );
    assert.equal(value.cases.filter(c => c.state === 'pass').length, 9);
    assert.ok(value.coverage.functions.length > 0);
    assert.throws(
      () =>
        validateP2Observation(
          child.stdout,
          JSON.parse(fs.readFileSync(new URL('dist/source-manifest.json', source))),
          fs.readFileSync(path.join(root, 'wrapper.mjs'))
        ),
      /exact ten cases/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
