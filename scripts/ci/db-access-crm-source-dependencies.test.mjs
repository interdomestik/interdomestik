import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { build, sha256 } from './db-access-crm-runtime-package-fixture.mjs';
import { verifyCrmSourceDependencies } from './db-access-crm-source-dependencies.mjs';

function fixture(t) {
  const data = build(t);
  const tarballRoot = path.join(data.base, 'tarballs');
  fs.cpSync(path.join(tarballRoot, 'crm'), path.join(tarballRoot, 'crm-source'), {
    recursive: true,
  });
  const bytes = Buffer.from(JSON.stringify({ name: 'alpha', version: '1.0.0' }));
  const record = {
    ...data.lock.packages[data.ids.alpha],
    files: {
      'package.json': { sha256: sha256(bytes), bytes: bytes.length, mode: '100644' },
    },
  };
  const contract = { sourceDependencies: [record] };
  return {
    record,
    contract,
    archive: path.join(tarballRoot, 'crm-source', sha256(record.integrity) + '.tgz'),
    run: () => verifyCrmSourceDependencies({ contract, tarballRoot, assembly: data.root }),
  };
}

test('source dependencies verify archive and selected exact source bytes', t => {
  const f = fixture(t);
  const result = f.run();
  assert.deepEqual(Object.keys(result), ['alpha@1.0.0']);
  assert.match(result['alpha@1.0.0'].filesSha256, /^[a-f0-9]{64}$/u);
});
for (const [name, mutate, error] of [
  ['missing inventory', f => delete f.contract.sourceDependencies, /inventory/u],
  ['duplicate identity', f => f.contract.sourceDependencies.push(f.record), /duplicate/u],
  ['empty file evidence', f => (f.record.files = {}), /empty/u],
  ['archive tampering', f => fs.appendFileSync(f.archive, 'tamper'), /integrity/u],
  [
    'wrong source digest',
    f => (f.record.files['package.json'].sha256 = '0'.repeat(64)),
    /identity/u,
  ],
  ['wrong source mode', f => (f.record.files['package.json'].mode = '100755'), /identity/u],
  ['escaping source path', f => (f.record.files = { '../outside': {} }), /input path/u],
  ['wrong package version', f => (f.record.version = '9.9.9'), /manifest/u],
]) {
  test('source dependencies refuse ' + name, t => {
    const f = fixture(t);
    mutate(f);
    assert.throws(f.run, error);
  });
}
