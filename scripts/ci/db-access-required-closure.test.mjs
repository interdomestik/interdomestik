import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  SOURCE_COMMIT,
  commit,
  git,
  gitBytes,
  rootDir,
  showAt,
  tmp,
  writeFile,
} from './db-access-required-git.mjs';
import {
  officialArchive,
  protectedIntegrity,
  sri,
  verifiedCompiler,
} from './db-access-required-compiler.mjs';
import { actualOrigin } from './db-access-required-origins.mjs';
import {
  candidateLock,
  canonical,
  openPullRequest,
  route,
} from './db-access-required-fixtures.mjs';
import { embedded } from './db-access-required-workflow.mjs';

const { default: ts } = await import(
  pathToFileURL(path.join(verifiedCompiler, 'lib/typescript.js')).href
);
const fail = reason => {
  throw new Error(reason);
};
// Exact embedded tree listing, regular-blob gate and closure walker over a supplied Git object view.
const loadClosure = new Function(
  'git',
  'sha',
  'ts',
  'path',
  'fail',
  `${embedded('const tree = new Map();', '// The approved engine baseline')}
${embedded('const files = new Map();', 'for (const [file, bytes] of files)')}
return files;`
);
const approved = loadClosure(args => gitBytes(rootDir, ...args), SOURCE_COMMIT, ts, path, fail);
const entry = 'scripts/check-db-access-guard.mjs';

function view(files, modes = {}) {
  const oids = new Map();
  const rows = [...files].map(([file, bytes], index) => {
    const oid = (index + 1).toString(16).padStart(40, '0');
    oids.set(oid, Buffer.from(bytes));
    return `${modes[file] ?? '100644'} blob ${oid}\t${file}`;
  });
  return args => {
    if (args[0] === 'ls-tree') return Buffer.from(`${rows.join('\0')}\0`);
    if (args[0] === 'cat-file' && args[1] === 'blob' && oids.has(args[2])) return oids.get(args[2]);
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
}
const append = text => files =>
  files.set(entry, Buffer.concat([Buffer.from(files.get(entry)), Buffer.from(text)]));
const closureFailure = (result, reason) => {
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /protected DB access guard incomplete/u);
  assert.match(result.stderr, reason);
  assert.equal(result.report, undefined);
  assert.doesNotMatch(result.stdout, /executes on merge/u);
};

test('embedded closure walker loads exactly the regular approved e113 modules', () => {
  for (const file of [
    entry,
    'scripts/ci/db-access-evaluator.mjs',
    'scripts/ci/db-access-adoption.mjs',
    'scripts/ci/db-access-trust.mjs',
  ])
    assert.ok(approved.has(file), file);
  assert.ok(approved.size <= 200);
  for (const [file, bytes] of approved) {
    assert.ok(file.endsWith('.mjs'), file);
    assert.deepEqual(bytes, showAt(SOURCE_COMMIT, file));
  }
});

test('embedded closure diagnostics: missing, non-regular, parse, bare, escape, dynamic and bound fail closed', () => {
  for (const [edit, reason, modes] of [
    [
      append("\nimport './ci/missing.mjs';\n"),
      /closure missing or non-regular scripts\/ci\/missing\.mjs/u,
    ],
    [
      () => {},
      /closure missing or non-regular scripts\/ci\/db-access-evaluator\.mjs/u,
      { 'scripts/ci/db-access-evaluator.mjs': '120000' },
    ],
    [append('\nexport const = ;\n'), /closure parse error/u],
    [append("\nimport pad from 'left-pad';\n"), /unsupported specifier left-pad/u],
    [append("\nimport '../../outside.mjs';\n"), /unsupported specifier \.\.\/\.\.\/outside\.mjs/u],
    [append("\nimport './ci/loader.js';\n"), /unsupported specifier \.\/ci\/loader\.js/u],
    [append("\nawait import('./ci/x.mjs');\n"), /dynamic loading/u],
    [append("\nrequire('./ci/x.mjs');\n"), /dynamic loading/u],
    [
      append("\nimport { createRequire } from 'node:module';\ncreateRequire(import.meta.url);\n"),
      /dynamic loading/u,
    ],
    [append("\nimport.meta.resolve('./ci/x.mjs');\n"), /dynamic loading/u],
  ]) {
    const files = new Map(approved);
    edit(files);
    assert.throws(() => loadClosure(view(files, modes), SOURCE_COMMIT, ts, path, fail), reason);
  }
  const chain = new Map([[entry, Buffer.from("import './ci/m0.mjs';\n")]]);
  for (let index = 0; index < 205; index++)
    chain.set(`scripts/ci/m${index}.mjs`, Buffer.from(`import './m${index + 1}.mjs';\n`));
  chain.set('scripts/ci/m205.mjs', Buffer.from('export {};\n'));
  assert.throws(
    () => loadClosure(view(chain), SOURCE_COMMIT, ts, path, fail),
    /closure bound exceeded/u
  );
});

test('compiler bytes authenticate only at the approved e113 lock; candidate and rolled base locks cannot waive', () => {
  assert.equal(sri(officialArchive), protectedIntegrity);
  const repack = path.join(tmp('synthetic-repack'), 'typescript.tgz');
  fs.writeFileSync(repack, Buffer.concat([fs.readFileSync(officialArchive), Buffer.from([0])]));
  const repackSri = sri(repack);
  const origin = actualOrigin();
  writeFile(origin, 'pnpm-lock.yaml', candidateLock(repackSri));
  commit(origin, 'rolled-forward base lock pinning a synthetic repack');
  const pr = openPullRequest(origin, root => {
    writeFile(root, 'pnpm-lock.yaml', candidateLock(repackSri));
    writeFile(root, 'apps/web/src/feature.ts', canonical);
  });
  closureFailure(
    route(pr, {}, { DB_GUARD_FIXTURE_TYPESCRIPT_TGZ: repack }),
    /does not match protected lock integrity/u
  );
  closureFailure(route(pr, { TS_EXPECTED_VERSION: '5.9.2' }), /is not 5\.9\.2/u);
  closureFailure(route(pr, {}, { GITHUB_ACTIONS: 'true' }), /fixture seam under GitHub Actions/u);
});

test('report path cannot be pre-seeded or redirected by the candidate', () => {
  const origin = actualOrigin();
  const stale = openPullRequest(origin, root => {
    writeFile(
      root,
      'tmp/db-access-guard/protected-base.json',
      JSON.stringify({ status: 'pass', scannedCount: 1, failingNewEntries: [] })
    );
    git(root, 'add', '-f', 'tmp');
  });
  const seeded = route(stale);
  assert.equal(seeded.status, 1);
  assert.match(seeded.stderr, /pre-existing protected report/u);
  assert.doesNotMatch(seeded.stdout, /executes on merge/u);
  const redirect = tmp('redirect');
  const linked = openPullRequest(origin, root => {
    fs.symlinkSync(redirect, path.join(root, 'tmp'));
    git(root, 'add', '-f', 'tmp');
  });
  const redirected = route(linked);
  assert.equal(redirected.status, 1);
  assert.match(redirected.stderr, /symlinked protected report path/u);
  assert.deepEqual(fs.readdirSync(redirect), []);
});
