import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// CHK-12 (R-12): a schema change travels one road, the journal. No package script, shell or node
// script and no workflow may push a schema, in a command line or as an argument array. The one
// exemption is the exact push-local invocation of database-command.mjs, which runs supabase with
// --local and refuses every target override.

const PACKAGE_RUNNERS = new Set(['pnpm', 'npm', 'yarn', 'turbo']);
const COMMAND_SEPARATORS = new Set([';', '&', '|', '(', ')', '{', '}', '\n']);

// The simple commands of a text, as the shell or a child-process call sees them: a backslash
// line continuation is removed, quotes are stripped, and commands end only at an unquoted,
// unescaped separator. A ' or " quote also ends at a line end, so an unbalanced quote can split
// more but never hide a later line. Array punctuation separates words, so an executable and its
// argument array (spawnSync('drizzle-kit', ['push'])) are one command.
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
  else if (/[\s,[\]]/u.test(char)) endWord(state);
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

// A folded YAML block scalar (run: >) is one command line: its lines are joined with spaces.
const deeper = (next, indent) =>
  next !== undefined && (next.trim() === '' || /^\s*/u.exec(next)[0].length > indent);
function unfoldYaml(text) {
  const lines = text.split('\n');
  const out = [];
  for (let at = 0; at < lines.length; at += 1) {
    let line = lines[at];
    const indent = /^\s*/u.exec(line)[0].length;
    const folded = /:\s*>[-+]?\s*$/u.test(line);
    while (folded && deeper(lines[at + 1], indent)) {
      at += 1;
      line += ` ${lines[at].trim()}`;
    }
    out.push(line);
  }
  return out.join('\n');
}

// A quoted word with spaces (bash -c '…', node -e "…") is read as commands of its own as well.
const isPush = text =>
  simpleCommands(text).some(
    words => pushesSchema(words) || words.some(word => /\s/u.test(word) && isPush(word))
  );

// The exemption, as it stands in database-command.mjs; it counts only once and only there.
const PUSH_LOCAL = /'exec',\s*'supabase',\s*'db',\s*'push',\s*'--local',/gu;
// drizzle-kit subcommands a package script may run: none of them reaches a database.
const DRIZZLE_KIT_OFFLINE = new Set(['generate', 'check', 'export']);

function trackedFiles(pattern) {
  const listed = spawnSync('/usr/bin/git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
  });
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

// Scripts and workflows; tests are excluded because they hold the refused forms as fixtures.
const PUSH_SCAN =
  /^(?:(?:scripts|tools|ops|apps\/web\/scripts|packages\/[^/]+\/(?:src\/)?scripts)\/.+\.(?:sh|bash|zsh|[cm]?[jt]s)|packages\/[^/]+\/[^/]+\.[cm]?[jt]s|[^/]+\.(?:sh|[cm]?[jt]s)|\.github\/.+\.ya?ml)$/u;

function pushOffenders(files, read) {
  return files.filter(file => {
    let source = read(file);
    if (file === 'scripts/database-command.mjs') {
      assert.equal(source.match(PUSH_LOCAL)?.length, 1, 'the one push-local invocation');
      source = source.replaceAll(PUSH_LOCAL, '');
    }
    return isPush(/\.ya?ml$/u.test(file) ? unfoldYaml(source) : source);
  });
}

test('no script or workflow calls a schema push, except the one push-local invocation', () => {
  const files = trackedFiles(PUSH_SCAN).filter(file => !/\.(?:test|spec)\.[cm]?[jt]s$/u.test(file));
  assert.ok(files.includes('scripts/database-command.mjs'), 'the exemption is scanned');
  assert.deepEqual(
    pushOffenders(files, file => readFileSync(join(root, file), 'utf8')),
    []
  );
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
    "spawnSync('drizzle-kit', ['push'])",
    'spawn("drizzle-kit", [ "push", "--strict" ])',
    "execFileSync('npx', ['drizzle-kit', 'push'])",
    "spawnSync('supabase', ['db', 'push', '--linked'])",
    "['--filter', '@interdomestik/database', 'exec', 'supabase', 'db', 'push', '--linked']",
    // Package version selectors, also shell-quoted, in command lines and argument arrays.
    'pnpm dlx supabase@2 db push',
    "pnpm dlx 'supabase@2' db push",
    'npx "drizzle-kit@0.30.0" push',
    'npx drizzle-kit@0.30.0 push',
    "spawn('npx', ['supabase@latest', 'db', 'push'])",
    "spawnSync('npx', ['drizzle-kit@x', 'push'])",
    // Path-qualified executables, in command lines and argument arrays.
    './node_modules/.bin/supabase db push',
    'node_modules/.bin/drizzle-kit push',
    '"/usr/local/bin/supabase" db push',
    "spawn('./node_modules/.bin/drizzle-kit', ['push'])",
    "execFileSync('/usr/local/bin/supabase@2', ['db', 'push'])",
    // Shell forms: a line continuation, and options with values between the words.
    './node_modules/.bin/supabase db \\\n  push',
    'supabase \\\n  db push --linked',
    'supabase --workdir . db push',
    'drizzle-kit --config x push',
    "spawnSync('supabase', ['--workdir', '.', 'db', 'push'])",
    'echo "it is done"; supabase db push',
    "echo it's\nsupabase db push",
    "bash -c 'supabase db push'",
    "node -e \"spawnSync('supabase', ['db', 'push'])\"",
  ]) {
    assert.ok(isPush(command), command);
  }
  for (const command of [
    'pnpm db:push:local',
    'git push origin',
    "args: ['push', 'origin', ref]",
    "if: github.event_name == 'push'",
    'drizzle-kit generate',
    'npx drizzle-kit@0.30.0 generate',
    "pnpm dlx 'supabase@2' db pull",
    'git push supabase@host db',
    'supabase db pull && git push',
    'supabase db pull\ngit push',
  ]) {
    assert.ok(!isPush(command), command);
  }
  // A versioned push under an innocuous package-script name is still a push script.
  assert.deepEqual(pushScripts({ scripts: { sync: "pnpm dlx 'supabase@2' db push" } }), ['sync']);
  assert.deepEqual(pushScripts({ scripts: { sync: './node_modules/.bin/supabase db push' } }), [
    'sync',
  ]);
  assert.deepEqual(
    pushScripts({ scripts: { sync: './node_modules/.bin/supabase db \\\n push' } }),
    ['sync']
  );
  // A folded YAML run command is one command line.
  const folded =
    'steps:\n  - run: >\n      supabase --workdir .\n      db push\n  - run: echo ok\n';
  assert.deepEqual(
    pushOffenders(['.github/workflows/x.yml'], () => folded),
    ['.github/workflows/x.yml']
  );
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

test('the exemption is the exact push-local invocation, nowhere else and not twice', () => {
  const local =
    "args = ['--filter', 'x', 'exec', 'supabase', 'db', 'push', '--local', '--workdir'];";
  const linked = "args = ['--filter', 'x', 'exec', 'supabase', 'db', 'push', '--linked'];";
  const sources = {
    'scripts/database-command.mjs': local,
    'scripts/other.mjs': local,
  };
  assert.deepEqual(
    pushOffenders(Object.keys(sources), file => sources[file]),
    ['scripts/other.mjs']
  );
  assert.deepEqual(
    pushOffenders(['scripts/database-command.mjs'], () => `${local}\n${linked}`),
    ['scripts/database-command.mjs']
  );
  assert.throws(
    () => pushOffenders(['scripts/database-command.mjs'], () => `${local}\n${local}`),
    /the one push-local invocation/u
  );
  assert.throws(
    () => pushOffenders(['scripts/database-command.mjs'], () => linked),
    /the one push-local invocation/u
  );
});
