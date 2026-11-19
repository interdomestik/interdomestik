import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// CHK-12 (R-12): a schema change travels one road, the journal. Two searches enforce it:
// - Shell text (package scripts and shell scripts) is read as the shell reads it, and no simple
//   command may push a schema.
// - Node and TypeScript scripts and workflow files are not parsed: a child-process argument array
//   or a folded YAML scalar has too many spellings for a text search. Instead, every mention of a
//   push tool (supabase, drizzle-kit) there is counted against a reviewed inventory, so a new
//   invocation in any spelling is a change to review. database-command.mjs, whose push-local
//   invocation runs supabase with --local and refuses every target override, is pinned byte for
//   byte. Database clients in those files are CHK-13's inventory (own-database-client.test.mjs).

const PACKAGE_RUNNERS = new Set(['pnpm', 'npm', 'yarn', 'turbo']);
const COMMAND_SEPARATORS = new Set([';', '&', '|', '(', ')', '{', '}', '\n']);

// The simple commands of a shell text: a backslash line continuation is removed, quotes are
// stripped, and commands end only at an unquoted, unescaped separator. A ' or " quote also ends at
// a line end, so an unbalanced quote can split more but never hide a later line.
function simpleCommands(text) {
  const state = { commands: [], words: [], word: '', quote: null };
  for (let at = 0; at < text.length; at += 1) {
    if (text[at] === '\\' && at + 1 < text.length) {
      at += 1;
      if (text[at] !== '\n') state.word += text[at];
    } else if (state.quote) readQuoted(state, text[at]);
    else readUnquoted(state, text[at]);
  }
  endCommand(state);
  return state.commands;
}

function readQuoted(state, char) {
  if (char === '\n' && state.quote !== '`') {
    state.quote = null;
    endCommand(state);
  } else if (char === state.quote) state.quote = null;
  else state.word += char;
}

function readUnquoted(state, char) {
  if (char === "'" || char === '"' || char === '`') state.quote = char;
  else if (COMMAND_SEPARATORS.has(char)) endCommand(state);
  else if (/\s/u.test(char)) endWord(state);
  else state.word += char;
}

function endWord(state) {
  if (state.word) state.words.push(state.word);
  state.word = '';
}

function endCommand(state) {
  endWord(state);
  if (state.words.length > 0) state.commands.push(state.words);
  state.words = [];
}

// A word names a tool by its basename without a version selector: ./node_modules/.bin/supabase,
// 'supabase@2' and /usr/local/bin/drizzle-kit@0.30.0 all name their tool.
const tool = word => word.slice(word.lastIndexOf('/') + 1).split('@')[0];

// supabase … db … push, or drizzle-kit … push[:dialect], with any words (options and their
// values) between them inside one simple command.
function pushesSchema(words) {
  const names = words.map(tool);
  const supabase = names.indexOf('supabase');
  const db = supabase < 0 ? -1 : names.indexOf('db', supabase + 1);
  if (db >= 0 && names.indexOf('push', db + 1) > db) return true;
  const kit = names.indexOf('drizzle-kit');
  if (kit >= 0 && names.slice(kit + 1).some(name => /^push(?::|$)/u.test(name))) return true;
  // A package script named push or db:push (also pkg#push), reached through a package manager or
  // turbo with any options before it; db:push:local is another name.
  const runner = names.findIndex(name => PACKAGE_RUNNERS.has(name));
  return runner >= 0 && words.slice(runner + 1).some(word => /^(?:\S+#)?(?:db:)?push$/u.test(word));
}

// A quoted word with spaces (bash -c '…', node -e "…") is read as commands of its own as well.
const isPush = text =>
  simpleCommands(text).some(
    words => pushesSchema(words) || words.some(word => /\s/u.test(word) && isPush(word))
  );

// The reviewed mentions of a push tool in Node, TypeScript and workflow files, by count; a file
// not listed has none. A mention is the tool's name as a word of its own (not a host such as
// x.supabase.co, a package such as @supabase/supabase-js, nor supabase-url).
const TOOL_MENTION = /(?<![\w.@-])(?:supabase|drizzle-kit)(?![\w-])/gu;
const REVIEWED_MENTIONS = Object.freeze({
  'packages/database/drizzle.config.ts': 1, // its config type, imported from drizzle-kit
  'scripts/abuse_test_rls.js': 2, // a client variable named supabase
  'scripts/ci/pr-gate-policy-lib.mjs': 1, // the supabase/ path prefix
  'scripts/ci/setup-private-node-cache.mjs': 1, // reads drizzle-kit's help text
  'scripts/database-command.mjs': 1, // the push-local invocation, pinned below
  'scripts/lean-current-authority-policy.mjs': 1, // the supabase/ path prefix
  'scripts/release-gate/config.ts': 1, // an error-text pattern
  'scripts/release-gate/product-checks.ts': 1, // an error-text pattern
});
const PINNED = Object.freeze({
  'scripts/database-command.mjs':
    '6d218f7a00a8286749a8d21170a318dec10247efd8baabe269314a9d39894e6f',
});
// drizzle-kit subcommands a package script may run: none of them reaches a database.
const DRIZZLE_KIT_OFFLINE = new Set(['generate', 'check', 'export']);

function trackedFiles(pattern) {
  const listed = spawnSync('/usr/bin/git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  return listed.stdout.split('\0').filter(file => pattern.test(file));
}

function pushScripts(manifest) {
  return Object.entries(manifest.scripts ?? {})
    .filter(([name, command]) => /(?:^|:)push$/u.test(name) || isPush(command))
    .map(([name]) => name);
}

function onlineDrizzleKitScripts(manifest) {
  return Object.entries(manifest.scripts ?? {})
    .filter(([, command]) =>
      [...command.matchAll(/\bdrizzle-kit(?:@\S+)?(?:\s+(\S+))?/gu)].some(
        ([, subcommand]) => !DRIZZLE_KIT_OFFLINE.has(subcommand)
      )
    )
    .map(([name]) => name);
}

test('no package script pushes a schema or runs a connecting drizzle-kit command', () => {
  for (const file of trackedFiles(/(?:^|\/)package\.json$/u)) {
    const manifest = JSON.parse(readFileSync(join(root, file), 'utf8'));
    assert.deepEqual(pushScripts(manifest), [], file);
    assert.deepEqual(onlineDrizzleKitScripts(manifest), [], file);
  }
  const turbo = JSON.parse(readFileSync(join(root, 'turbo.json'), 'utf8'));
  assert.deepEqual(
    Object.keys(turbo.tasks ?? turbo.pipeline ?? {}).filter(n => /push/u.test(n)),
    []
  );
});

// Script roots, package script folders, package roots and the repository root; tests are excluded
// because they hold the refused forms as fixtures.
const SCRIPT =
  /^(?:(?:scripts|tools|ops|apps\/web\/scripts|packages\/[^/]+\/(?:src\/)?scripts)\/.+|packages\/[^/]+\/[^/]+|[^/]+)\.(?:sh|bash|zsh|[cm]?[jt]s)$/u;
const SHELL = /\.(?:sh|bash|zsh)$/u;
const WORKFLOW = /^\.github\/.+\.ya?ml$/u;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]s$/u;

const shellOffenders = (files, read) => files.filter(file => isPush(read(file)));

// Each Node, TypeScript or workflow file whose push-tool mentions differ from the reviewed count,
// and each pinned file whose bytes changed.
function mentionOffenders(files, read) {
  return files.filter(file => {
    const source = read(file);
    if (Object.hasOwn(PINNED, file)) {
      const digest = createHash('sha256').update(source).digest('hex');
      if (digest !== PINNED[file]) return true;
    }
    return [...source.matchAll(TOOL_MENTION)].length !== (REVIEWED_MENTIONS[file] ?? 0);
  });
}

test('no shell script pushes a schema; node and workflow files keep their reviewed mentions', () => {
  const files = trackedFiles(/./u).filter(file => !TEST_FILE.test(file));
  const shell = files.filter(file => SCRIPT.test(file) && SHELL.test(file));
  const other = files.filter(
    file => (SCRIPT.test(file) && !SHELL.test(file)) || WORKFLOW.test(file)
  );
  const read = file => readFileSync(join(root, file), 'utf8');
  assert.ok(shell.includes('scripts/m4-gatekeeper.sh'), 'shell scripts are scanned');
  assert.deepEqual(shellOffenders(shell, read), []);
  for (const file of Object.keys(REVIEWED_MENTIONS)) assert.ok(other.includes(file), file);
  assert.ok(other.includes('.github/workflows/ci.yml'), 'workflows are counted');
  assert.deepEqual(mentionOffenders(other, read), []);
});

test('the push-command search refuses each removed form and admits only the local road', () => {
  for (const command of [
    'drizzle-kit push',
    'npx drizzle-kit push:pg',
    'pnpm exec drizzle-kit push --force',
    'supabase db push',
    'pnpm dlx supabase db push --db-url "$URL"',
    'pnpm db:push',
    'pnpm run db:push',
    'pnpm --filter @interdomestik/database push',
    'pnpm -F @interdomestik/database push',
    'pnpm -C packages/database run push',
    'pnpm --silent --filter=@interdomestik/database db:push',
    'npm run push',
    'turbo run db:push',
    'turbo run @interdomestik/database#push',
    // Package version selectors, also shell-quoted.
    'pnpm dlx supabase@2 db push',
    "pnpm dlx 'supabase@2' db push",
    'npx "drizzle-kit@0.30.0" push',
    'npx drizzle-kit@0.30.0 push',
    // Path-qualified executables.
    './node_modules/.bin/supabase db push',
    'node_modules/.bin/drizzle-kit push',
    '"/usr/local/bin/supabase" db push',
    // Shell forms: a line continuation, and options with values between the words.
    './node_modules/.bin/supabase db \\\n  push',
    'supabase \\\n  db push --linked',
    'supabase --workdir . db push',
    'drizzle-kit --config x push',
    'echo "it is done"; supabase db push',
    "echo it's\nsupabase db push",
    "bash -c 'supabase db push'",
  ]) {
    assert.ok(isPush(command), command);
  }
  for (const command of [
    'pnpm db:push:local',
    'git push origin',
    'drizzle-kit generate',
    'npx drizzle-kit@0.30.0 generate',
    "pnpm dlx 'supabase@2' db pull",
    'git push supabase@host db',
    'supabase db pull && git push',
    'supabase db pull\ngit push',
  ]) {
    assert.ok(!isPush(command), command);
  }
  // A push under an innocuous package-script name is still a push script.
  for (const sync of [
    "pnpm dlx 'supabase@2' db push",
    './node_modules/.bin/supabase db \\\n push',
  ]) {
    assert.deepEqual(pushScripts({ scripts: { sync } }), ['sync'], sync);
  }
  assert.deepEqual(pushScripts({ scripts: { 'db:push': 'x', push: 'y', 'db:studio': 'z' } }), [
    'db:push',
    'push',
  ]);
  assert.deepEqual(
    pushScripts({ scripts: { 'db:push:local': 'node scripts/database-command.mjs push-local' } }),
    []
  );
  assert.deepEqual(
    onlineDrizzleKitScripts({
      scripts: {
        generate: 'drizzle-kit generate',
        check: 'drizzle-kit check && drizzle-kit export',
        migrate: 'drizzle-kit migrate',
        studio: 'drizzle-kit studio',
        bare: 'drizzle-kit',
        pull: 'drizzle-kit generate && drizzle-kit pull',
        pinned: 'npx drizzle-kit@0.30.0 generate',
        pinnedPush: 'npx drizzle-kit@0.30.0 migrate',
      },
    }),
    ['migrate', 'studio', 'bare', 'pull', 'pinnedPush']
  );
});

test('a node or workflow mention of a push tool beyond the reviewed count is refused', () => {
  const sources = {
    // Spellings the shell search does not read: a multiline argument array, a folded YAML scalar
    // with a comment on its header, an inline workflow script, a path with a version.
    'scripts/sync.mjs':
      "spawnSync(\n  'pnpm',\n  [\n    'exec',\n    'supabase',\n    'db',\n    'push',\n  ]\n);",
    '.github/workflows/x.yml':
      'steps:\n  - run: > # database step\n      supabase --workdir .\n      db push\n',
    '.github/workflows/y.yml':
      "steps:\n  - uses: actions/github-script@v7\n    with:\n      script: exec('drizzle-kit', ['push'])\n",
    'scripts/path.mjs': "spawn('./node_modules/.bin/drizzle-kit@0.30.0', ['push'])",
    // Not a mention: a host, a package, an input name, an environment variable.
    'scripts/hosts.mjs':
      "'db.x.supabase.co'; '@supabase/supabase-js'; 'supabase-url'; SUPABASE_URL",
    // One more than reviewed.
    'scripts/release-gate/config.ts': "/supabase/i; spawnSync('supabase', ['db', 'push'])",
  };
  assert.deepEqual(
    mentionOffenders(Object.keys(sources), file => sources[file]),
    [
      'scripts/sync.mjs',
      '.github/workflows/x.yml',
      '.github/workflows/y.yml',
      'scripts/path.mjs',
      'scripts/release-gate/config.ts',
    ]
  );
  const pinned = 'scripts/database-command.mjs';
  const source = readFileSync(join(root, pinned), 'utf8');
  const offenders = text => mentionOffenders([pinned], () => text);
  assert.deepEqual(offenders(source), []);
  // A changed pinned file, even with the same mention count: a linked push, or one byte.
  assert.deepEqual(offenders(source.replace("'--local'", "'--linked'")), [pinned]);
  assert.deepEqual(offenders(`${source} `), [pinned]);
});
