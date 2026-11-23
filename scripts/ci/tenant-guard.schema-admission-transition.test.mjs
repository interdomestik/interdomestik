// Tenant guard S2 pins, Git input validation, and reviewed historical replay fixtures.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { tmp } from './db-access-required-git.mjs';
import { KERNEL_ANCHOR, LEGACY, LEGACY_PINS } from './tenant-guard/manifest.mjs';
import { kernelAnchorPins } from './tenant-guard/rules-schema-admission.mjs';
import { evaluate } from './tenant-guard/rules.mjs';
import { readSchemaTree, schemaTreeFromBlobs, trustedSources } from './tenant-guard/sources.mjs';
import { TRUSTED } from './tenant-guard/trusted.mjs';

const ROOT = new URL('../../', import.meta.url);
const SCHEMA = 'packages/database/src/schema';
const BARREL = `${SCHEMA}/index.ts`;
const WP_MODULE = `${SCHEMA}/exchange-rates.ts`;
const git = (args, { cwd = ROOT, input } = {}) =>
  execFileSync('/usr/bin/git', args, {
    cwd,
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
const ref = commit => ({
  commit: git(['rev-parse', `${commit}^{commit}`]).trim(),
  tree: git(['rev-parse', `${commit}^{tree}`]).trim(),
});
const ACQ_OLD = ref('4488a6543');
const ACQ_NEW = ref('51739130e');
const WP_OLD = ref('faff03119');
const WP_NEW = ref('1b592d7eb');
const PRE_CUTOVER = ref('44033ca8c');
const CURRENT_TUPLE = [
  'd5a48cd0122819d13b21c018aa2728d7f675de0d2306b379fbc21330ffe7b5d9',
  '7a219887513dba5ff0b88241b9926b13c010d51ceaee7a020e4ab1f8dfb2d988',
  '3cbacb145c83aa637e232999b07dd4f10131ba23dec5dc62282c8f5e0a1ad671',
];
const ACQ_TUPLE = [
  [
    '97650c0c5409095be3aedf0c68ecd4bde4bb898a9264b892f2d61a6bff691e37',
    '92e239c86942fe9c17d22826b9e0c64ed0e132f2e57d1408e26289988ccc16eb',
  ],
  [
    '0a9dacf96cfdce1a57a728efee7b3a723802f8cc5fd8a8c6346eabea33597f8f',
    '40c646fcae0b203d0337dbb0e5ceb46091f2403cf9f89f6065878d4c504c76e7',
  ],
  [
    'f6030648819e130f965138672b666c115e78791f5997a6395069e7adcbda8d92',
    '93c5c961056320a272ed82e9e5cc8822715a76ce4b79bc53e8d7ab7f14fb74df',
  ],
];
const WP_SUCCESSOR = [
  '1d75e1be9ef39be8b7e1fd522f5f62d5e34479a67d2b61af5d6c0d9985ff5c60',
  '692e1867c412c7d42112590cbea6a94d11a6e8d0a0832427204bf19cfcf29ba9',
  '66891cd8aa8f554c2bb6c95204833b02a6b47b756d137db25f4bca9abf2b66ed',
];
const PRE_CUTOVER_V2 = [
  'v2:cd510b832702e29d8fa20a134032be27c071ce90544137cf18df2f42378f4602',
  'v2:e3667d8a8207b7689dd1ab9cd1d54185aa54eade9186abe908888631d4cc8739',
  'v2:96900df444bd7d695798af14354847399dc609f0470c1f24edae0a5f77ec782e',
];
const pins = tuple => new Map([...LEGACY.keys()].map((key, index) => [key, tuple[index]]));
const trusted = trustedSources(ROOT, TRUSTED);
const predecessor = readSchemaTree(ROOT, PRE_CUTOVER, 'historical');
const anchor =
  KERNEL_ANCHOR.commit === PRE_CUTOVER.commit && KERNEL_ANCHOR.tree === PRE_CUTOVER.tree
    ? predecessor
    : readSchemaTree(ROOT, KERNEL_ANCHOR, 'anchor');

function evaluateTree(candidate, options = {}) {
  return evaluate({ sources: candidate.sources, graph: candidate.graph, trusted, ...options });
}

test('the pinned anchor reproduces the complete v2 tuple and the historical v1 tuple', () => {
  assert.deepEqual(kernelAnchorPins(anchor), LEGACY_PINS);
  const exact = evaluateTree(predecessor, { legacyPins: null });
  assert.deepEqual(exact.legacyDigests, Object.fromEntries(pins(CURRENT_TUPLE)));
  const v2 = evaluateTree(anchor, { schemaAdmission: { anchor, base: anchor, candidate: anchor } });
  assert.equal(v2.schemaAdmission.ok, true, v2.schemaAdmission.reason);
  assert.deepEqual(v2.legacyDigests, Object.fromEntries(LEGACY_PINS));
  assert.deepEqual(v2.pinnedModules, evaluateTree(anchor, { legacyPins: null }).pinnedModules);
});

function wpTailBlobs() {
  const blobs = new Map(predecessor.blobs);
  blobs.set(WP_MODULE, git(['show', `${WP_NEW.commit}:${WP_MODULE}`]));
  blobs.set(BARREL, `${predecessor.sources.get(BARREL)}export * from './exchange-rates';\n`);
  return blobs;
}

function evaluateWpTail(blobs) {
  const candidate = schemaTreeFromBlobs(blobs);
  return evaluateTree(candidate, {
    legacyPins: pins(PRE_CUTOVER_V2),
    schemaAdmission: { anchor: predecessor, base: predecessor, candidate },
  });
}

for (const [file, change] of [
  ['scripts/pilot/import-pilot-database.ts', text => text + ' '],
  ['scripts/pilot/scenario_helpers.ts', text => text.replace(
    "'./import-pilot-database'", "'./import-pilot-databasf'"
  )],
]) {
  test(`a one-byte change to ${file} refuses the tail append`, () => {
    const blobs = wpTailBlobs();
    const original = Buffer.from(blobs.get(file));
    const changed = Buffer.from(change(original.toString()));
    const differences = original.filter((byte, index) => byte !== changed[index]).length;
    assert.equal(differences + changed.length - original.length, 1);
    blobs.set(file, changed.toString());
    const result = evaluateWpTail(blobs);
    assert.equal(result.schemaAdmission.ok, false);
    assert.equal(result.schemaAdmission.reason, `candidate: schema forward outside scan roots ${file}`);
  });
}

test('a third outside forwarder in scripts/pilot refuses the tail append', () => {
  const file = 'scripts/pilot/copied-forwarder.ts';
  const blobs = wpTailBlobs();
  blobs.set(file, blobs.get('scripts/pilot/import-pilot-database.ts'));
  const result = evaluateWpTail(blobs);
  assert.equal(result.schemaAdmission.ok, false);
  assert.equal(result.schemaAdmission.reason, `candidate: schema forward outside scan roots ${file}`);
});

test('WP-07 appended at the tail binds all three v2 pins with exact historical consumers', () => {
  const blobs = wpTailBlobs();
  const candidate = schemaTreeFromBlobs(blobs);
  const legacyPins = pins(PRE_CUTOVER_V2);
  const result = evaluateWpTail(blobs);
  assert.equal(result.schemaAdmission.ok, true, result.schemaAdmission.reason);
  assert.deepEqual(result.legacyDigests, Object.fromEntries(legacyPins));
  assert.deepEqual(
    result.violations.filter(({ rule }) => rule === 'pin' || rule === 'C1'),
    []
  );
  assert.ok(result.telemetry.legacyAccepted > 0);
  assert.ok(result.pinnedModules.includes(WP_MODULE));
  for (const name of ['exchangeRateBooks', 'exchangeRates'])
    assert.ok(result.tenantState.includes(`${WP_MODULE}#${name}`));
  assert.deepEqual(
    result.pinnedModules,
    evaluateTree(candidate, { legacyPins: null }).pinnedModules
  );
});

for (const [name, previous, successor, tuple] of [
  ['ACQ-3b', ACQ_OLD, ACQ_NEW, ACQ_TUPLE],
  [
    'WP-07 original',
    WP_OLD,
    WP_NEW,
    CURRENT_TUPLE.map((digest, index) => [digest, WP_SUCCESSOR[index]]),
  ],
]) {
  test(`${name} matches its independently reviewed exact transition`, () => {
    for (const object of [previous, successor]) {
      const snapshot = readSchemaTree(ROOT, object, 'historical');
      const result = evaluateTree(snapshot, { legacyPins: pins(tuple) });
      assert.deepEqual(
        result.violations.filter(({ rule }) => rule === 'pin' || rule === 'C1'),
        []
      );
      assert.ok(result.telemetry.legacyAccepted > 0);
    }
  });
}

test('ACQ-3b edits four existing schema modules and the structural path refuses', () => {
  const base = readSchemaTree(ROOT, ACQ_OLD, 'base');
  const candidate = readSchemaTree(ROOT, ACQ_NEW, 'candidate');
  const changes = [...base.sources].filter(
    ([file, text]) =>
      file.startsWith(`${SCHEMA}/`) && file !== BARREL && candidate.sources.get(file) !== text
  );
  assert.deepEqual(
    changes.map(([file]) => file),
    ['leads', 'membership-plans', 'subscriptions', 'tenant-entity-decomposition'].map(
      name => `${SCHEMA}/${name}.ts`
    )
  );
  const result = evaluateTree(candidate, {
    legacyPins: kernelAnchorPins(base),
    schemaAdmission: { anchor: base, base, candidate },
  });
  assert.equal(result.schemaAdmission.ok, false);
  assert.match(
    result.schemaAdmission.reason,
    /^candidate: changed kernel module packages\/database\/src\/schema\//u
  );
  assert.equal(result.violations.filter(({ rule }) => rule === 'pin').length, LEGACY.size);
});

for (const [role, input, reason] of [
  ['base', {}, 'missing base commit/tree'],
  ['anchor', { commit: '', tree: '' }, 'empty anchor commit/tree'],
  ['base', { commit: 'bad', tree: 'bad' }, 'invalid base commit/tree'],
  ['anchor', { commit: KERNEL_ANCHOR.commit, tree: 'd'.repeat(40) }, 'anchor tree mismatch'],
  ['base', { commit: KERNEL_ANCHOR.commit, tree: 'd'.repeat(40) }, 'base tree mismatch'],
]) {
  test(`Git input refuses ${reason}`, () => {
    assert.throws(() => readSchemaTree(ROOT, input, role), { message: reason });
    const result = evaluateTree(anchor, { schemaAdmission: { reason } });
    assert.equal(result.schemaAdmission.ok, false);
    assert.equal(result.schemaAdmission.reason, reason);
    assert.equal(result.violations.filter(({ rule }) => rule === 'pin').length, LEGACY.size);
  });
}

for (const [label, mode, content, reason] of [
  ['anchor', '120000', Buffer.from('other.ts'), 'non-regular blob'],
  ['base', '100644', Buffer.from([0xc3, 0x28]), 'malformed UTF-8 blob'],
]) {
  test(`${label} Git blob refuses ${reason}`, () => {
    const cwd = tmp('s2-admission-data');
    git(['init', '-q'], { cwd });
    const blob = git(['hash-object', '-w', '--stdin'], { cwd, input: content }).trim();
    const tree = git(['mktree'], { cwd, input: `${mode} blob ${blob}\tentry.ts\n` }).trim();
    const commit = git(
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.test',
        'commit-tree',
        tree,
        '-m',
        'data fixture',
      ],
      { cwd }
    ).trim();
    assert.throws(() => readSchemaTree(cwd, { commit, tree }, label), {
      message: `${label}: ${reason} entry.ts`,
    });
  });
}

for (const preexisting of [false, true]) {
  test(`Drizzle path retarget with unchanged lock integrity (preexisting=${preexisting})`, () => {
    const withAlias = new Map(predecessor.blobs);
    withAlias.set(
      'tsconfig.alias.json',
      JSON.stringify({ compilerOptions: { paths: { 'drizzle-orm/*': ['./outside/drizzle/*'] } } })
    );
    withAlias.set('outside/drizzle/pg-core.ts', 'export const pgTable = 1;');
    const base = preexisting ? schemaTreeFromBlobs(withAlias) : predecessor;
    const blobs = new Map(withAlias);
    blobs.set(WP_MODULE, git(['show', `${WP_NEW.commit}:${WP_MODULE}`]));
    blobs.set(BARREL, `${predecessor.sources.get(BARREL)}export * from './exchange-rates';\n`);
    const candidate = schemaTreeFromBlobs(blobs);
    assert.equal(candidate.inputs.get('pnpm-lock.yaml'), base.inputs.get('pnpm-lock.yaml'));
    assert.equal(
      candidate.graph.resolveSpecifier(WP_MODULE, 'drizzle-orm/pg-core').external,
      'drizzle-orm/pg-core'
    );
    const result = evaluateTree(candidate, {
      legacyPins: pins(PRE_CUTOVER_V2),
      schemaAdmission: { anchor: predecessor, base, candidate },
    });
    assert.equal(result.schemaAdmission.ok, false);
    assert.equal(
      result.schemaAdmission.reason,
      'candidate: builder alias matches drizzle-orm/pg-core'
    );
    assert.ok(
      result.violations.some(
        ({ rule, detail }) => rule === 'C1' && detail.includes('depends on changed code')
      )
    );
  });
}

test('a workspace builder candidate under an outside-roots baseUrl is refused', () => {
  const common = new Map(predecessor.blobs);
  common.set(
    'tsconfig.base-url.json',
    JSON.stringify({ compilerOptions: { baseUrl: './fixture' } })
  );
  common.set('fixture/drizzle-orm/pg-core.ts', 'export const pgTable = 1;');
  const base = schemaTreeFromBlobs(common);
  const blobs = new Map(common);
  blobs.set(WP_MODULE, git(['show', `${WP_NEW.commit}:${WP_MODULE}`]));
  blobs.set(BARREL, `${predecessor.sources.get(BARREL)}export * from './exchange-rates';\n`);
  const candidate = schemaTreeFromBlobs(blobs);
  const result = evaluateTree(candidate, {
    legacyPins: pins(PRE_CUTOVER_V2),
    schemaAdmission: { anchor: predecessor, base, candidate },
  });
  assert.equal(
    result.schemaAdmission.reason,
    'candidate: workspace builder candidate drizzle-orm/pg-core'
  );
  assert.equal(result.schemaAdmission.ok, false);
});
