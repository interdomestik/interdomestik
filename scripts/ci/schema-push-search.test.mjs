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
const QUOTE = String.raw`['"\x60]`;
const ARRAY_GAP = String.raw`${QUOTE}\s*,\s*(?:\[\s*)?${QUOTE}`;
// A tool name, also with a package version selector (supabase@2, drizzle-kit@0.30.0).
const VERSION = String.raw`(?:@[^\s'"\x60]+)?`;
// A command-line word, also shell-quoted or path-qualified: supabase, 'supabase@2', "db",
// ./node_modules/.bin/supabase. Only a word, quote or path character may not run into it.
const word = name => String.raw`(?<![\w@.-])${QUOTE}?${name}${QUOTE}?`;
// An argument-array element, also path-qualified: 'drizzle-kit', '/usr/local/bin/supabase@2'.
const element = name => String.raw`(?<=['"\x60/])${name}`;
const DRIZZLE_KIT = `drizzle-kit${VERSION}`;
const SUPABASE = `supabase${VERSION}`;
const PUSH_FORMS = [
  // Command lines, also through npx, pnpm exec or dlx: drizzle-kit push[:dialect], supabase db push.
  String.raw`${word(DRIZZLE_KIT)}\s+${word('push')}`,
  String.raw`${word(SUPABASE)}\s+${word('db')}\s+${word('push')}`,
  // A package script named push or db:push, reached through a package manager or turbo, with any
  // options (--filter x, -F x, -C dir, --silent) before it.
  String.raw`\b(?:pnpm|npm|yarn|turbo)(?:\s+(?:run|exec|-[-\w]+(?:=\S+|\s+\S+)?))*\s+(?:\S+#)?(?:db:)?push\b(?!:local)`,
  // Argument arrays: spawn('drizzle-kit', ['push']), [..., 'supabase@2', 'db', 'push'].
  String.raw`${element(DRIZZLE_KIT)}${ARRAY_GAP}push${QUOTE}`,
  String.raw`${element(SUPABASE)}${ARRAY_GAP}db${ARRAY_GAP}push${QUOTE}`,
];
const PUSH_COMMAND = new RegExp(PUSH_FORMS.join('|'), 'u');
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
    .filter(([name, command]) => /(?:^|:)push$/u.test(name) || PUSH_COMMAND.test(command))
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
    return PUSH_COMMAND.test(source);
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
  ]) {
    assert.match(command, PUSH_COMMAND, command);
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
  ]) {
    assert.doesNotMatch(command, PUSH_COMMAND, command);
  }
  // A versioned push under an innocuous package-script name is still a push script.
  assert.deepEqual(pushScripts({ scripts: { sync: "pnpm dlx 'supabase@2' db push" } }), ['sync']);
  assert.deepEqual(pushScripts({ scripts: { sync: './node_modules/.bin/supabase db push' } }), [
    'sync',
  ]);
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
