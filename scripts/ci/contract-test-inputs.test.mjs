import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inputClosure,
  inventory,
  parseSource,
  resolveLiteral,
  touches,
} from './contract-test-inputs.mjs';
import { commandScripts } from './contract-test-wiring.mjs';

const byText = (left, right) => left.localeCompare(right);
const sources = files => file => files[file];
const closureFor = (files, test, extra = []) =>
  inputClosure(test, sources(files), inventory([...Object.keys(files), ...extra]));

test('literals resolve relative to the file only for ./ and ../, else from the root', () => {
  const tracked = inventory([
    'scripts/ci/helper.mjs',
    'scripts/lib/util.mjs',
    '.github/workflows/ci.yml',
    'apps/web/e2e/a.spec.ts',
    'docs/x.md',
    'docs/Release Notes.md',
  ]);
  const from = 'scripts/ci/x.test.mjs';
  assert.deepEqual(resolveLiteral(from, './helper', tracked), {
    kind: 'file',
    path: 'scripts/ci/helper.mjs',
  });
  assert.deepEqual(resolveLiteral(from, '../lib/util.mjs', tracked), {
    kind: 'file',
    path: 'scripts/lib/util.mjs',
  });
  assert.deepEqual(resolveLiteral(from, '.github/workflows/ci.yml', tracked), {
    kind: 'file',
    path: '.github/workflows/ci.yml',
  });
  assert.deepEqual(resolveLiteral(from, '.github/workflows', tracked), {
    kind: 'dir',
    path: '.github/workflows/',
  });
  assert.deepEqual(resolveLiteral(from, 'apps/web/e2e/', tracked), {
    kind: 'dir',
    path: 'apps/web/e2e/',
  });
  // An exact tracked path resolves even with a space in it.
  assert.deepEqual(resolveLiteral(from, 'docs/Release Notes.md', tracked), {
    kind: 'file',
    path: 'docs/Release Notes.md',
  });
  // Area roots, single-segment directories, escapes, absolute paths and prose resolve to nothing.
  for (const text of ['scripts/ci', 'apps/web', 'docs', '../../../x', '/etc/hosts', 'a b', '']) {
    assert.equal(resolveLiteral(from, text, tracked), null, text);
  }
  // Suffixes apply to relative imports only.
  assert.equal(resolveLiteral(from, 'scripts/ci/helper', tracked), null);
});

test('the closure follows scripts, keeps template parts and marks scanners', () => {
  const files = {
    'scripts/ci/a.test.mjs':
      "import { x } from './lib.mjs';\nconst p = `${root}/apps/web/playwright.config.ts`;\n",
    'scripts/ci/lib.mjs': "export const x = 'packages/database/src/schema';\n",
    'scripts/ci/scan.test.mjs': "fs.readdirSync('.github/workflows');\n",
  };
  const extra = ['apps/web/playwright.config.ts', 'packages/database/src/schema/a.ts'];
  const closure = closureFor(files, 'scripts/ci/a.test.mjs', extra);
  assert.deepEqual(
    [...closure.files].sort(byText),
    ['apps/web/playwright.config.ts', 'scripts/ci/a.test.mjs', 'scripts/ci/lib.mjs'].sort(byText)
  );
  assert.deepEqual([...closure.dirs], ['packages/database/src/schema/']);
  assert.equal(closure.scanner, false);
  const schemaFile = 'packages/database/src/schema/a.ts';
  assert.equal(touches(closure, [schemaFile]), schemaFile);

  const scan = closureFor(files, 'scripts/ci/scan.test.mjs', ['.github/workflows/ci.yml']);
  assert.equal(scan.scanner, true);
  // A scanner matches file inputs only; its directory reads belong to the area table.
  assert.equal(touches(scan, ['.github/workflows/ci.yml']), undefined);
  assert.equal(touches(scan, ['scripts/ci/scan.test.mjs']), 'scripts/ci/scan.test.mjs');
});

test('only parsed calls and listing arguments make a scanner, never comments or prose', () => {
  const file = 'scripts/ci/a.test.mjs';
  for (const source of [
    '// fs.readdirSync() is not used here\n',
    "assert.ok(true, 'no readdirSync( call and no ls-files listing');\n",
    "const help = 'ls-files output is sorted';\n",
    "const help = 'git ls-files lists tracked files';\n",
    "test('git ls-files output stays sorted', () => {});\n",
    "assert.equal(run('ls-files'), 1);\n",
    'const walker = 1;\n',
  ]) {
    assert.equal(parseSource(file, source).scanner, false, source);
  }
  for (const source of [
    "fs.readdirSync('x');\n",
    "const { glob } = await import('node:fs/promises');\nawait glob('*.mjs');\n",
    "execFileSync('git', ['ls-files', '-z']);\n",
    "execSync('git ls-files -z');\n",
  ]) {
    assert.equal(parseSource(file, source).scanner, true, source);
  }
});

test('prose that starts with ls-files keeps the directory inputs', () => {
  const files = {
    'scripts/ci/a.test.mjs':
      "const help = 'ls-files output is sorted';\nconst schema = 'packages/db/src/schema';\n",
  };
  const c = closureFor(files, 'scripts/ci/a.test.mjs', ['packages/db/src/schema/a.ts']);
  assert.equal(touches(c, ['packages/db/src/schema/a.ts']), 'packages/db/src/schema/a.ts');
});

test('shell and Python prose about ls-files keeps the directory inputs', () => {
  for (const body of [
    'echo "git ls-files lists tracked files"\n',
    'cat docs/x.md # read like git ls-files would\n',
    "print('git ls-files is not run here')\n",
    'echo "use \\"git ls-files\\" for an inventory"\n',
    'echo "a quoted # is no comment"; echo "git ls-files in a string"\n',
    'help="spans\nlines; git ls-files is described here"\n',
  ]) {
    const files = {
      'scripts/ci/a.test.mjs': "run('scripts/tool.sh');\nconst dir = 'packages/db/schema';\n",
      'scripts/tool.sh': body,
    };
    const c = closureFor(files, 'scripts/ci/a.test.mjs', ['packages/db/schema/a.sql', 'docs/x.md']);
    assert.equal(c.scanner, false, body);
    assert.equal(touches(c, ['packages/db/schema/a.sql']), 'packages/db/schema/a.sql', body);
  }
  assert.equal(parseSource('scripts/t.py', 'run(["git", "ls-files", "-z"])\n').scanner, true);
  assert.equal(parseSource('scripts/t.sh', 'n=${#list}; git ls-files\n').scanner, true);
  // Python: a multiline docstring is a string; a shell single quote has no escapes.
  const docstring = 'def f():\n    """List like\n    git ls-files would."""\n    return 1\n';
  assert.equal(parseSource('scripts/t.py', docstring).scanner, false);
  assert.equal(parseSource('scripts/t.py', "x = '''a\ngit ls-files'''\n").scanner, false);
  const inner = 'def f():\n    """Run like "git ls-files" would."""\n';
  assert.equal(parseSource('scripts/t.py', inner).scanner, false);
  assert.equal(parseSource('scripts/t.sh', "echo 'a\\'; git ls-files\n").scanner, true);
  assert.equal(parseSource('scripts/t.sh', 'echo \\"; git ls-files\n').scanner, true);
});

test('shell and Python helpers keep quoted paths with spaces and see their listings', () => {
  const spaced = 'docs/Release Notes.md';
  for (const [helper, body] of [
    ['scripts/tool.sh', `# git ls-files is not run here\ncat "${spaced}" "\${ROOT}/docs/x.md"\n`],
    ['scripts/tool.py', `open("${spaced}")\n`],
  ]) {
    const files = { 'scripts/ci/a.test.mjs': `run('${helper}');\n`, [helper]: body };
    const c = closureFor(files, 'scripts/ci/a.test.mjs', [spaced, 'docs/x.md']);
    assert.ok(c.files.has(spaced), helper);
    assert.equal(c.scanner, false, helper);
  }
  assert.equal(parseSource('scripts/tool.sh', 'git ls-files -z | xargs cat\n').scanner, true);
  assert.equal(
    parseSource('scripts/tool.py', 'for p in Path("a").rglob("*"): pass\n').scanner,
    true
  );
});

test('the closure follows TypeScript and shell scripts under scripts/', () => {
  const files = {
    'scripts/ci/a.test.mjs': "run('scripts/helper.mts');\nrun('scripts/tool.sh');\n",
    'scripts/helper.mts': "export const config = 'config/a.json';\n",
    'scripts/tool.sh': 'cat "docs/input.md" > /dev/null\n',
  };
  const closure = closureFor(files, 'scripts/ci/a.test.mjs', ['config/a.json', 'docs/input.md']);
  assert.ok(closure.files.has('config/a.json'));
  assert.ok(closure.files.has('docs/input.md'));
  assert.equal(closure.scanner, false);
});

test('a deleted input still selects the unchanged test that reads it', () => {
  const config = 'apps/web/playwright.config.ts';
  const files = { 'scripts/ci/a.test.mjs': `read('${config}');\n` };
  // The input exists only at the merge-base: HEAD deleted it, so `read` returns nothing for it.
  const closure = closureFor(files, 'scripts/ci/a.test.mjs', [config]);
  assert.equal(touches(closure, [config]), config);
});

test('command wiring follows pnpm links and refuses anything else', () => {
  const scripts = {
    top: 'pnpm a && pnpm run b',
    a: 'node scripts/a.mjs',
    b: 'node scripts/b.mjs && pnpm c',
    c: 'node scripts/c.mjs --flag',
    odd: 'pnpm a && tsx scripts/d.ts',
    piped: 'node scripts/a.mjs | node scripts/b.mjs',
    lines: 'node scripts/a.mjs\nnode scripts/b.mjs',
    beforeAnd: 'node scripts/a.mjs\n&& node scripts/b.mjs',
    afterAnd: 'node scripts/a.mjs &&\tnode scripts/b.mjs',
    bracketed: 'node scripts/[ab].mjs',
    quoted: 'node "scripts/a.mjs"',
    expanded: 'node $ENTRY',
    spaced: 'node  scripts/a.mjs',
    argued: 'node scripts/a.mjs data/x.json --flag',
    redirected: 'node scripts/a.mjs > out.txt',
    either: 'node scripts/a.mjs || node scripts/b.mjs',
    flagged: 'pnpm -s a',
    dotted: 'node ./scripts/a.mjs && pnpm a',
    escaping: 'node ../outside.mjs',
    diamond: 'pnpm dotted && pnpm a',
    loop: 'pnpm loop2',
    loop2: 'pnpm loop',
  };
  const seen = new Set();
  assert.deepEqual(commandScripts(scripts, 'top', seen), [
    'scripts/a.mjs',
    'scripts/b.mjs',
    'scripts/c.mjs',
  ]);
  assert.deepEqual([...seen].sort(byText), ['a', 'b', 'c', 'top']);
  for (const name of [
    'odd',
    'piped',
    'lines',
    'beforeAnd',
    'afterAnd',
    'bracketed',
    'quoted',
    'expanded',
    'spaced',
    'redirected',
    'either',
    'flagged',
    'escaping',
  ]) {
    assert.equal(commandScripts(scripts, name), null, name);
  }
  // Non-flag arguments are closure roots too; entry paths are normalized; a shared link is no cycle.
  assert.deepEqual(commandScripts(scripts, 'argued'), ['scripts/a.mjs', 'data/x.json']);
  assert.deepEqual(commandScripts(scripts, 'dotted'), ['scripts/a.mjs', 'scripts/a.mjs']);
  assert.deepEqual(commandScripts(scripts, 'diamond'), [
    'scripts/a.mjs',
    'scripts/a.mjs',
    'scripts/a.mjs',
  ]);
  assert.equal(commandScripts(scripts, 'loop'), null);
  assert.equal(commandScripts(scripts, 'missing'), null);
});

test('fail safe: workspace imports pin package directories; an unknown package is unresolved', () => {
  const files = {
    'scripts/ci/a.test.mjs':
      "import { db } from '@interdomestik/db/schema';\nconst m = await import('@interdomestik/ghost');\nrun('scripts/h.cts');\n",
    'scripts/h.cts': "import leaf = require('@interdomestik/leaf');\n",
  };
  const tracked = inventory([...Object.keys(files), 'packages/db/src/a.ts', 'packages/utils/b.ts']);
  tracked.workspace = new Map([
    ['@interdomestik/db', ['packages/db', 'packages/utils']],
    ['@interdomestik/leaf', ['packages/leaf']],
  ]);
  const c = inputClosure('scripts/ci/a.test.mjs', sources(files), tracked);
  assert.deepEqual([...c.pinned].sort(byText), [
    'packages/db/',
    'packages/leaf/',
    'packages/utils/',
  ]);
  assert.equal(c.unresolved, '@interdomestik/ghost (imported by scripts/ci/a.test.mjs)');
  const scanning = { ...c, scanner: true };
  assert.equal(touches(scanning, ['packages/utils/b.ts']), 'packages/utils/b.ts');
});

test('fail safe: an uncertain listing pins its own directories even in a scanning closure', () => {
  const helpers = {
    'scripts/lister.mjs':
      "const list = fs.readdirSync;\nexport const dir = 'packages/db/schema';\n",
    'scripts/lister.sh': '# walk it like git ls-files would\nls packages/db/schema\n',
  };
  for (const [helper, body] of Object.entries(helpers)) {
    const files = {
      'scripts/ci/a.test.mjs': `run('${helper}');\nfs.readdirSync('docs');\n`,
      [helper]: body,
    };
    const c = closureFor(files, 'scripts/ci/a.test.mjs', ['packages/db/schema/a.sql', 'docs/x.md']);
    assert.equal(c.scanner, true, helper);
    assert.deepEqual([...c.pinned], ['packages/db/schema/'], helper);
    assert.equal(touches(c, ['packages/db/schema/b.sql']), 'packages/db/schema/b.sql', helper);
  }
});
