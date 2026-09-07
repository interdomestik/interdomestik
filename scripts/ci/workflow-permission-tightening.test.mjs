import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';

import { evaluateModularityGuard } from '../lib/modularity-guard.mjs';
import { createTempRoot, writeFile } from '../plan-test-helpers.mjs';

const WORKFLOW = '.github/workflows/ci.yml';
const READS = { actions: 'read', contents: 'read', 'pull-requests': 'read' };
const JOBS = ['validation-surface', 'audit', 'static', 'unit', 'ai-eval', 'e2e-gate'];
const serialize = value => yaml.dump(value, { noRefs: true, lineWidth: -1 });

function workflows() {
  const before = {
    name: 'CI',
    on: { push: { branches: ['main'] }, pull_request: {} },
    permissions: { ...READS },
    jobs: Object.fromEntries(
      JOBS.map(name => [
        name,
        {
          'runs-on': 'ubuntu-latest',
          steps: [{ uses: 'actions/checkout@v6' }, { run: `node scripts/${name}.mjs` }],
        },
      ])
    ),
  };
  const after = structuredClone(before);
  after.permissions = { contents: 'read' };
  for (const name of ['validation-surface', 'audit']) {
    after.jobs[name].permissions = { ...READS };
  }
  return { before, after };
}

function violations(t, before, after) {
  const root = createTempRoot('workflow-permissions-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8' }).trim();
  git(['init', '-q']);
  git(['config', 'user.email', 'tests@example.com']);
  git(['config', 'user.name', 'Tests']);
  writeFile(root, WORKFLOW, typeof before === 'string' ? before : serialize(before));
  git(['add', '.']);
  git(['commit', '-qm', 'baseline']);
  const baseRef = git(['rev-parse', 'HEAD']);
  writeFile(root, WORKFLOW, typeof after === 'string' ? after : serialize(after));
  return evaluateModularityGuard({ root, baseRef }).violations;
}

function rejects(t, before, after) {
  assert.deepEqual(
    violations(t, before, after).map(({ file, reason }) => ({ file, reason })),
    [{ file: WORKFLOW, reason: 'workflow-complexity-growth' }]
  );
}

test('allows CI read grants narrowed to the two jobs that need them', t => {
  const { before, after } = workflows();
  assert.deepEqual(violations(t, before, after), []);
});

test('treats an explicit job map as a replacement, including empty and none grants', t => {
  const { before, after } = workflows();
  before.jobs.static.permissions = {};
  after.jobs.static.permissions = { contents: 'none' };
  assert.deepEqual(violations(t, before, after), []);
});

test('compares permission maps independently of key order and flow formatting', t => {
  const { before, after } = workflows();
  const reordered = Object.fromEntries(Object.entries(after).reverse());
  const flowMaps = value => yaml.dump(value, { noRefs: true, flowLevel: 3 });
  assert.deepEqual(violations(t, flowMaps(before), flowMaps(reordered)), []);
});

const unsafeEdits = [
  ['actions write grant', (_before, after) => (after.jobs.audit.permissions.actions = 'write')],
  ['PR write grant', (_before, after) => (after.jobs.audit.permissions['pull-requests'] = 'write')],
  [
    'new actions grant on a restricted job',
    (before, after) => {
      before.jobs.static.permissions = { contents: 'read' };
      after.jobs.static.permissions = { contents: 'read', actions: 'read' };
    },
  ],
  [
    'new PR grant on a restricted job',
    before => {
      before.jobs.audit.permissions = { contents: 'read' };
    },
  ],
  [
    'no effective reduction',
    (_before, after) => {
      for (const job of Object.values(after.jobs)) job.permissions = { ...READS };
    },
  ],
  ['additional job', (_before, after) => (after.jobs.extra = structuredClone(after.jobs.unit))],
  [
    'removed job',
    (before, after) => {
      before.jobs.unit.steps = [];
      delete after.jobs.unit;
    },
  ],
  ['additional step', (_before, after) => after.jobs.unit.steps.push({ run: 'echo extra' })],
  ['changed command', (_before, after) => (after.jobs.unit.steps[1].run = 'echo changed')],
  ['changed action', (_before, after) => (after.jobs.unit.steps[0].uses = 'actions/checkout@v5')],
  ['job condition', (_before, after) => (after.jobs.unit.if = 'always()')],
  ['step condition', (_before, after) => (after.jobs.unit.steps[1].if = 'always()')],
  ['job dependency', (_before, after) => (after.jobs.unit.needs = ['audit'])],
  ['changed trigger', (_before, after) => (after.on.push.branches = ['release'])],
  [
    'nested permission-named input',
    (before, after) => {
      before.jobs.unit.steps[0].with = { permissions: 'old-value' };
      after.jobs.unit.steps[0].with = { permissions: 'new-value' };
    },
  ],
];

for (const [name, edit] of unsafeEdits) {
  test(`rejects permission relocation with ${name}`, t => {
    const { before, after } = workflows();
    edit(before, after);
    rejects(t, before, after);
  });
}

const unknownPermissions = [
  null,
  'read-all',
  'write-all',
  '${{ inputs.permissions }}',
  ['contents', 'read'],
  { contents: true },
  { contents: 'unknown' },
  { 'future-scope': 'read' },
];

for (const permissions of unknownPermissions) {
  for (const target of ['before', 'after']) {
    test(`rejects unknown ${target} permission semantics: ${JSON.stringify(permissions)}`, t => {
      const pair = workflows();
      pair[target].permissions = permissions;
      rejects(t, pair.before, pair.after);
    });
  }
}

for (const target of ['before', 'after']) {
  test(`rejects implicit ${target} workflow permissions`, t => {
    const pair = workflows();
    delete pair[target].permissions;
    rejects(t, pair.before, pair.after);
  });
  test(`rejects an unknown ${target} job permission map`, t => {
    const pair = workflows();
    pair[target].jobs.audit.permissions = null;
    rejects(t, pair.before, pair.after);
  });
}

const unsupportedYaml = [
  ['duplicate keys', text => `${text}permissions: { contents: read }\n`],
  ['additional document', text => `${text}---\nname: other\n`],
  ['custom tag', text => `${text}env: !unknown { VALUE: value }\n`],
  ['anchor', text => `${text}env: &shared { VALUE: value }\n`],
  ['merge key', text => `${text}env: { <<: { VALUE: value } }\n`],
  ['complex mapping key', text => `${text}env: { ? [VALUE]: value }\n`],
  ['YAML directive', text => `%YAML 1.1\n---\n${text}`],
  ['tag directive', text => `%TAG !e! tag:example.com,2026:\n---\n${text}`],
  ['explicit scalar tag', text => `${text}env: { VALUE: !!str value }\n`],
  ['invalid YAML', text => `${text}env: [\n`],
];

for (const [name, transform] of unsupportedYaml) {
  test(`rejects ambiguous or unsupported YAML: ${name}`, t => {
    const { before, after } = workflows();
    rejects(t, transform(serialize(before)), transform(serialize(after)));
  });
}

test('does not normalize away a changed numeric command', t => {
  const { before, after } = workflows();
  before.jobs.unit.steps[1].run = 10;
  after.jobs.unit.steps[1].run = 10;
  rejects(t, serialize(before), serialize(after).replace('run: 10', 'run: 010'));
});

test('does not normalize away a changed matrix scalar type', t => {
  const { before, after } = workflows();
  before.jobs.unit.strategy = { matrix: { enabled: [false] } };
  after.jobs.unit.strategy = { matrix: { enabled: ['false'] } };
  rejects(t, before, after);
});

for (const [name, value] of [
  ['source size', 'x'.repeat(256 * 1024)],
  ['node count', Array.from({ length: 10_000 }, () => 'value')],
  ['nesting depth', Array.from({ length: 65 }).reduce(value => [value], 'value')],
]) {
  test(`fails closed when YAML exceeds bounded ${name}`, t => {
    const { before, after } = workflows();
    before.jobs.unit.strategy = { matrix: { value } };
    after.jobs.unit.strategy = structuredClone(before.jobs.unit.strategy);
    rejects(t, before, after);
  });
}
