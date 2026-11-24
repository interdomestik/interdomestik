import assert from 'node:assert/strict';
import test from 'node:test';

// Cases from the selector's final review (round 2): each fails if its fix is reverted.
import { structuralChange, testSetChange } from './contract-test-affected.mjs';
import { inputClosure, inventory, parseSource, resolveLiteral } from './contract-test-inputs.mjs';
import { rawDiffProblem } from './contract-test-parse.mjs';
import { e2eWiring } from './contract-test-wiring.mjs';

const sides = (before, after = before) => ({ before, after });

test('a quoted link of the contracts command is part of the wiring check', () => {
  for (const quote of ["'", '"']) {
    const before = {
      'test:ci:contracts:parallel': `pnpm run ${quote}contracts:impl${quote}`,
      'contracts:impl': 'node scripts/c.mjs',
      'check:e2e-contracts': 'node scripts/e2e.mjs',
    };
    const after = { ...before, 'contracts:impl': 'node scripts/c.mjs --all' };
    const paths = inventory(['scripts/c.mjs', 'scripts/e2e.mjs']);
    const work = e2eWiring(null, null, () => '', paths, sides(before, after));
    assert.match(work.full, /wiring changed/u, quote);
  }
});

test('a quoted ls-files is a listing only inside a Git argument list', () => {
  const notListing = [
    ['scripts/t.sh', "tool='git'\nhelp='ls-files'\ntest -d fixtures/lanes\n"],
    ['scripts/t.py', "tool = 'git'\nhelp = 'ls-files'\n"],
    ['scripts/a.test.mjs', "assert.deepEqual(args, ['ls-files']);\n"],
    ['scripts/b.test.mjs', "const help = ['see', 'ls-files'];\n"],
  ];
  for (const [file, source] of notListing) {
    assert.equal(parseSource(file, source).scanner, false, source);
  }
  const listing = [
    ['scripts/t.py', 'run(["git", "ls-files", "-z"])\n'],
    ['scripts/t.sh', "args=('git' 'ls-files')\n"],
    ['scripts/a.test.mjs', "execFileSync('git', ['ls-files', '-z']);\n"],
    ['scripts/b.test.mjs', "run(['git', 'ls-files']);\n"],
  ];
  for (const [file, source] of listing) {
    assert.equal(parseSource(file, source).scanner, true, source);
  }
});

test('literal module names resolve as Node does, for E2E entries and required files', () => {
  const files = {
    'scripts/check-e2e.js': "readFileSync('docs/e2e-input.md');\n",
    'scripts/ci/a.test.mjs': "run('scripts/h.cjs');\n",
    'scripts/h.cjs': "const fixture = require('./fixture');\n",
  };
  const paths = inventory([...Object.keys(files), 'docs/e2e-input.md', 'scripts/fixture.json']);
  const read = file => files[file];
  const scripts = {
    'test:ci:contracts:parallel': 'node c',
    'check:e2e-contracts': 'node scripts/check-e2e',
  };
  const { closure } = e2eWiring(null, null, read, paths, sides(scripts));
  assert.ok(closure.files.has('scripts/check-e2e.js'));
  assert.ok(closure.files.has('docs/e2e-input.md'));
  const c = inputClosure('scripts/ci/a.test.mjs', read, paths);
  assert.ok(c.files.has('scripts/fixture.json'));
});

test('named limit: a single-segment directory literal (except .github) is no directory input', () => {
  const tracked = inventory(['fixtures/a.json', '.github/x.yml', 'scripts/ci/a.mjs']);
  assert.equal(resolveLiteral('scripts/ci/t.mjs', 'fixtures', tracked), null);
  assert.equal(resolveLiteral('scripts/ci/t.mjs', 'scripts/ci', tracked), null);
  assert.deepEqual(resolveLiteral('scripts/ci/t.mjs', '.github', tracked), {
    kind: 'dir',
    path: '.github/',
  });
});

test('rename and copy scores are three digits from 000 to 100', () => {
  for (const status of ['R999', 'R1000', 'C101', 'R50', 'R']) {
    assert.match(rawDiffProblem(`${status}\0a\0b\0`), /^unrecognized diff entry /u, status);
  }
  for (const status of ['R000', 'R087', 'R100', 'C075']) {
    assert.equal(rawDiffProblem(`${status}\0a\0b\0`), null, status);
  }
});

test("the test-set rule counts the runner's planned files outside scripts/ci", () => {
  const extra = 'scripts/check-modularity-guard.test.mjs';
  const added = [{ file: extra, oldPath: null, status: 'A' }];
  assert.equal(testSetChange(added), undefined);
  const tests = ['scripts/ci/a.test.mjs', extra];
  assert.equal(structuralChange(added, tests), extra);
  const modified = [{ file: extra, oldPath: null, status: 'M' }];
  assert.equal(structuralChange(modified, tests), undefined);
});
