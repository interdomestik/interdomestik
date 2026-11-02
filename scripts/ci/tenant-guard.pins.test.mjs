import assert from 'node:assert/strict';
import test from 'node:test';
import {
  KERNEL,
  PACKAGES,
  assertRefused,
  file,
  run,
  runWithBase,
} from './tenant-guard-test-support.mjs';

const WRAPPED_KERNEL = {
  'packages/database/src/wrap.ts': 'export function wrap<T>(fn: T): T { return fn; }\n',
  'packages/database/src/tenant.ts': [
    "import { dbRls } from './db';",
    "import { wrap } from './wrap';",
    'const begin = wrap(async (action: (tx: any) => unknown) => dbRls.transaction(action));',
    'export async function withTenantContext(context: unknown, action: (tx: any) => unknown) {',
    '  return begin(action);',
    '}',
    'export async function withTenantDb(context: unknown, action: (tx: any) => unknown) {',
    '  return withTenantContext(context, action);',
    '}',
  ].join('\n'),
};

test('Q4: the legacy pin binds wrappers, module initialization and every module in the import closure', () => {
  assert.deepEqual(runWithBase(WRAPPED_KERNEL).violations, []);
  const wrapper = runWithBase(WRAPPED_KERNEL, {
    'packages/database/src/wrap.ts':
      'export function wrap<T>(fn: T): T { return ((action: any) => (fn as any)(() => action)) as T; }\n',
  });
  assertRefused(wrapper, 'pin', /legacy kernel entry differs from its reviewed contract/u);
  const effect = runWithBase(WRAPPED_KERNEL, {
    'packages/database/src/tenant.ts': `${WRAPPED_KERNEL['packages/database/src/tenant.ts']}\n(globalThis as any).tenantOverride = 'tenant-victim';`,
  });
  assertRefused(effect, 'pin', /legacy kernel entry differs from its reviewed contract/u);
});

test('Q4: an unresolved or opaque kernel closure edge cannot be pinned', () => {
  const unresolved = runWithBase(
    {},
    {
      'packages/database/src/db.ts': `import './missing-kernel-module';\n${KERNEL['packages/database/src/db.ts']}`,
    },
    { repin: true }
  );
  assertRefused(
    unresolved,
    'pin',
    /legacy kernel closure cannot be bound: .*unresolved import \.\/missing-kernel-module/u
  );
  const opaque = runWithBase(
    {},
    {
      'packages/database/src/db.ts': `${KERNEL['packages/database/src/db.ts']}export const load = (name: string) => import(name);\n`,
    },
    { repin: true }
  );
  assertRefused(opaque, 'pin', /legacy kernel closure cannot be bound: .*non-literal specifier/u);
});

test('Q4: a changed wrapper taints an unchanged non-kernel declaration it wraps', () => {
  const base = {
    'apps/web/src/wrap.ts': 'export function wrap<T>(fn: T): T { return fn; }\n',
    'apps/web/src/picked.ts': [
      "import { withTenantContext } from '@interdomestik/database';",
      "import { wrap } from './wrap';",
      'const pick = wrap((session: any) => session.user.tenantId);',
      'export function read(session: any) { return withTenantContext({ tenantId: pick(session) }, tx => tx.select()); }',
    ].join('\n'),
  };
  const result = runWithBase(base, {
    'apps/web/src/wrap.ts':
      "export function wrap<T>(fn: T): T { return ((session: any) => 'tenant-victim') as T; }\n",
  });
  assertRefused(result, 'C1', /depends on changed code \(pick\)/u);
});

test('the owner pin is an exact commit and tree pair, and an unpinned comparator fails closed', async () => {
  const { TRUSTED } = await import('./tenant-guard/trusted.mjs');
  assert.ok(Object.isFrozen(TRUSTED));
  assert.match(TRUSTED.commit, /^[0-9a-f]{40}$/u);
  assert.match(TRUSTED.tree, /^[0-9a-f]{40}$/u);

  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const cli = fileURLToPath(new URL('./tenant-guard.mjs', import.meta.url));
  for (const override of ['859d5019a', 'HEAD', 'main']) {
    const run = spawnSync(process.execPath, [cli, '--trusted', override], { encoding: 'utf8' });
    assert.equal(run.status, 2, override);
    assert.match(run.stderr, /trusted comparator is not pinned/u);
  }
});

test('the S2 required workflow binds the same trusted pin and runs only the S2 entry', async () => {
  const fs = await import('node:fs');
  const { TRUSTED } = await import('./tenant-guard/trusted.mjs');
  const workflow = fs.readFileSync(
    new URL('../../.github/workflows/tenant-guard-s2-required.yml', import.meta.url),
    'utf8'
  );
  const pin = name => workflow.match(new RegExp(`^ {10}${name}='([0-9a-f]{40})'$`, 'mu'))?.[1];
  assert.equal(pin('trusted_commit'), TRUSTED.commit);
  assert.equal(pin('trusted_tree'), TRUSTED.tree);
  assert.match(pin('source_commit') ?? '', /^[0-9a-f]{40}$/u);
  assert.match(pin('source_tree') ?? '', /^[0-9a-f]{40}$/u);
  assert.notEqual(pin('source_commit'), '0'.repeat(40), 'the S2 source must be pinned');
  assert.match(workflow, /const pending = \['scripts\/ci\/tenant-guard\.mjs'\];/u);
  assert.match(workflow, /GIT_DIR="\$work\/git"/u);
  assert.doesNotMatch(workflow, /check-db-access-guard|db-access-baseline/u);
});

// U2-069 resolver binding: a candidate's resolution configuration is data the guard models, never
// a way to make a privileged module look like an external package.
const ADMIN_READ = ['export const read = () => dbAdmin.select();'];

test('a tsconfig path alias to the privileged database module is resolved, not external', () => {
  const attack = file(["import { dbAdmin } from 'db-alias';", ...ADMIN_READ]);
  const resolution = {
    pathRules: [{ pattern: 'db-alias', targets: ['packages/database/src/db.ts'] }],
    baseRoots: [],
  };
  assertRefused(run(attack, { resolution }), 'R-a', /dbAdmin is not available to this file/u);
  const wildcard = {
    pathRules: [{ pattern: '~db/*', targets: ['packages/database/src/*'] }],
    baseRoots: [],
  };
  assertRefused(
    run(file(["import { dbAdmin } from '~db/db';", ...ADMIN_READ]), { resolution: wildcard }),
    'R-a',
    /dbAdmin is not available to this file/u
  );
});

test('a baseUrl-relative bare import of the privileged module is resolved, not external', () => {
  const attack = file(["import { dbAdmin } from 'packages/database/src/db';", ...ADMIN_READ]);
  assertRefused(
    run(attack, { resolution: { pathRules: [], baseRoots: [''] } }),
    'R-a',
    /dbAdmin is not available to this file/u
  );
  // A bare name that reaches no workspace file under the root stays an external package.
  const external = run(file(["import { z } from 'zod';", 'export const s = z;']), {
    resolution: { pathRules: [], baseRoots: [''] },
  });
  assert.deepEqual(
    external.violations.filter(violation => violation.file === 'apps/web/src/attack.ts'),
    []
  );
});

test('a custom export condition cannot hide the privileged module behind a preferred one', () => {
  const packages = new Map(PACKAGES);
  packages.set('evil-db', {
    name: 'evil-db',
    dir: 'packages/database',
    exports: { '.': { 'evil-condition': './src/db.ts', import: './src/schema.ts' } },
    main: null,
  });
  assertRefused(
    run(file(["import { dbAdmin } from 'evil-db';", ...ADMIN_READ]), { packages }),
    'R-a',
    /dbAdmin is not available to this file/u
  );
});

test('resolution configs are parsed as data; unmodeled options, foreign extends and symlinks refuse', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { resolutionConfig, workspaceGlobViolations } =
    await import('./tenant-guard/resolution.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-guard-resolution-'));
  const write = (relative, text) => {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), text);
  };
  try {
    write(
      'tsconfig.json',
      '{ "compilerOptions": { "baseUrl": ".", "paths": { "~db/*": ["packages/database/src/*"] } } }'
    );
    // JSONC with comments, inheriting baseUrl and paths through a relative extends.
    write('packages/qa/tsconfig.json', '{\n  // inherits\n  "extends": "../../tsconfig.json",\n}');
    write(
      'apps/web/tsconfig.json',
      '{ "compilerOptions": { "baseUrl": ".", "paths": { "db-alias": ["../../packages/database/src/db.ts"] } } }'
    );
    write(
      'pnpm-workspace.yaml',
      'packages:\n  - apps/*\n  - packages/*\n\nallowBuilds:\n  esbuild: true\n'
    );
    const accepted = resolutionConfig(root);
    assert.deepEqual(accepted.violations, []);
    assert.deepEqual(accepted.baseRoots, ['', 'apps/web']);
    assert.deepEqual(
      accepted.pathRules.filter(rule => rule.pattern === 'db-alias'),
      [{ pattern: 'db-alias', targets: ['packages/database/src/db.ts'] }]
    );
    assert.equal(accepted.pathRules.filter(rule => rule.pattern === '~db/*').length, 2);
    assert.deepEqual(workspaceGlobViolations(root), []);

    write('packages/qa/tsconfig.json', '{ "extends": "@tsconfig/node20/tsconfig.json" }');
    write(
      'packages/ui/tsconfig.json',
      '{ "compilerOptions": { "rootDirs": ["src", "../database/src"] } }'
    );
    write('pnpm-workspace.yaml', 'packages:\n  - apps/*\n  - packages/*\n  - tools/*\n');
    const refused = resolutionConfig(root).violations.map(violation => violation.detail);
    assert.ok(
      refused.some(detail => /unsupported extends "@tsconfig/u.test(detail)),
      refused
    );
    assert.ok(
      refused.some(detail => /unmodeled resolver option rootDirs/u.test(detail)),
      refused
    );
    assert.match(workspaceGlobViolations(root)[0].detail, /workspace globs/u);

    fs.rmSync(path.join(root, 'packages/ui/tsconfig.json'));
    fs.symlinkSync(path.join(root, 'tsconfig.json'), path.join(root, 'packages/ui/tsconfig.json'));
    assert.throws(() => resolutionConfig(root), /incomplete: resolution config .* is not a file/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an executable bundler config is admitted only unchanged from the trusted tree', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const { bundlerConfigViolations } = await import('./tenant-guard/resolution.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-guard-bundler-'));
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  try {
    fs.mkdirSync(path.join(root, 'apps/web'), { recursive: true });
    fs.writeFileSync(path.join(root, 'apps/web/next.config.mjs'), 'export default {};\n');
    git('init', '-q');
    git('add', '.');
    git('commit', '-q', '-m', 'trusted');
    const commit = git('rev-parse', 'HEAD');
    assert.deepEqual(bundlerConfigViolations(root, commit), []);

    fs.writeFileSync(
      path.join(root, 'apps/web/next.config.mjs'),
      "export default { webpack: c => ({ ...c, resolve: { alias: { x: '../../packages/database/src/db.ts' } } }) };\n"
    );
    fs.writeFileSync(path.join(root, 'apps/web/next.config.ts'), 'export default {};\n');
    const changed = bundlerConfigViolations(root, commit).map(violation => violation.file);
    assert.deepEqual(changed, ['apps/web/next.config.mjs', 'apps/web/next.config.ts']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('export patterns resolve as Node does: every target star takes the match; multi-star keys never match', async () => {
  const { packageCandidates } = await import('./tenant-guard/package-exports.mjs');
  const pkg = {
    dir: 'packages/x',
    exports: { './*': './src/*/entry-*.ts', './a*b*': './src/hidden.ts' },
  };
  assert.ok(packageCandidates(pkg, '/db').includes('packages/x/src/db/entry-db.ts'));
  assert.ok(!packageCandidates(pkg, '/a1b2').includes('packages/x/src/hidden.ts'));
});
