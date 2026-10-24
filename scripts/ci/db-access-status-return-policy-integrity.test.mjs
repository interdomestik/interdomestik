import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
const names = [
  'db-access-status-return-equivalence.mjs',
  'db-access-status-return-equivalence-policy.json',
  'db-access-status-return-sources-1.json',
  'db-access-status-return-sources-2.json',
  'db-access-status-return-dependencies.json',
];
for (const name of names.slice(1))
  test('changed immutable policy part refuses: ' + name, () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'status-return-policy-'));
    try {
      for (const file of names)
        fs.copyFileSync(new URL(file, import.meta.url), path.join(temporary, file));
      fs.appendFileSync(path.join(temporary, name), '\n');
      const result = spawnSync(process.execPath, [path.join(temporary, names[0])], {
        encoding: 'utf8',
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /fixed status-return equivalence policy source mismatch/);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
