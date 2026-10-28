// Independently authenticated local Git fixture, not the production runtime/event.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function makeCompiledAuthFixture() {
  const requested =
    process.env.M4_COMPILED_SOURCE_TEST_ROOT ?? fileURLToPath(new URL('../..', import.meta.url));
  if (!path.isAbsolute(requested)) throw Error('Absolute source fixture root required');
  const canonical = fs.realpathSync(requested);
  if (!fs.statSync(canonical).isDirectory()) throw Error('Physical source fixture root required');
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-auth-')));
  const write = (relative, bytes) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, bytes, { mode: 0o644 });
  };
  const copy = relative => write(relative, fs.readFileSync(path.join(canonical, relative)));
  const git = args =>
    execFileSync(
      '/usr/bin/git',
      ['-C', root, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args],
      {
        env: { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    ).trim();
  try {
    const names = [
      'db-access-m4-compiled-producer-loader.mjs',
      'db-access-m4-compiled-producer-auth.mjs',
    ];
    for (const name of names)
      write('scripts/ci/' + name, fs.readFileSync(new URL('./' + name, import.meta.url)));
    write(
      'scripts/ci/db-access-m4-compiled-runtime.mjs',
      `import fs from 'node:fs';
import ts from 'typescript';
import {assertM4CompiledModuleAdmission,assertM4CompiledInvocation} from './db-access-m4-compiled-producer-loader.mjs';
assertM4CompiledModuleAdmission(import.meta.url);
if(ts.version!=='5.9.3')throw Error('Fixture compiler mismatch');
fs.writeFileSync(new URL('./import-marker',import.meta.url),'fixture-only');
export function runM4CompiledRuntime(options,token){assertM4CompiledInvocation(token,import.meta.url,options.producer,options.context);return {fixtureOnly:true};}
export const isFreshM4CompiledRuntimeResult=()=>false;
export const hasM4CompiledRuntimeBinding=()=>false;
`
    );
    write(
      'scripts/ci/db-access-m4-compiled-runtime-contract.mjs',
      'export const fixtureOnly=true;\n'
    );
    write('scripts/ci/db-access-m4-compiled-runtime-contract.json', '{"fixtureOnly":true}\n');
    copy('scripts/ci/db-access-m4-worker-loader-contract.json');
    copy('scripts/ci/db-access-baseline.json');
    copy('pnpm-lock.yaml');
    const contract = JSON.parse(
      fs.readFileSync(path.join(root, 'scripts/ci/db-access-m4-worker-loader-contract.json'))
    );
    const sourceTs = fs.realpathSync(path.join(canonical, 'node_modules/typescript'));
    for (const relative of Object.keys(contract.dependency.files))
      write('node_modules/typescript/' + relative, fs.readFileSync(path.join(sourceTs, relative)));
    const files = [
      ...names,
      'db-access-m4-compiled-runtime.mjs',
      'db-access-m4-compiled-runtime-contract.mjs',
      'db-access-m4-compiled-runtime-contract.json',
      'db-access-m4-worker-loader-contract.json',
    ];
    const producerFiles = Object.fromEntries(
      files.map(name => {
        const file = 'scripts/ci/' + name,
          bytes = fs.readFileSync(path.join(root, file));
        return [file, { mode: '100644', bytes: bytes.length, sha256: digest(bytes) }];
      })
    );
    write(
      'scripts/ci/db-access-provider-unit-policy.json',
      JSON.stringify({
        runtimeFiles: {},
        producerFiles,
        resolverFiles: { 'pnpm-lock.yaml': { sha256: contract.dependency.lockfile.sha256 } },
      })
    );
    git(['init', '-q']);
    git(['add', 'scripts', 'pnpm-lock.yaml']);
    git([
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '-qm',
      'local protected compiled loader fixture',
    ]);
    const commit = git(['rev-parse', 'HEAD']),
      tree = git(['rev-parse', 'HEAD^{tree}']);
    git(['update-ref', 'refs/protected/main', commit]);
    return {
      root,
      sourceRoot: canonical,
      options: {
        producer: root,
        gitDir: path.join(root, '.git'),
        context: {
          version: 1,
          repository: 'interdomestik/interdomestik',
          eventName: 'push',
          baseCommit: commit,
          headCommit: commit,
          candidateCommit: commit,
          candidateTree: tree,
          sourceCommit: commit,
          sourceTree: tree,
          protectedMain: commit,
        },
      },
      cleanup: () => fs.rmSync(root, { recursive: true }),
    };
  } catch (error) {
    fs.rmSync(root, { recursive: true });
    throw error;
  }
}

export function addRepinnedUnboundFixtureDependency(fixture) {
  const runtime = path.join(fixture.root, 'scripts/ci/db-access-m4-compiled-runtime.mjs');
  fs.writeFileSync(runtime, "import './unbound-helper.mjs';\n" + fs.readFileSync(runtime, 'utf8'));
  fs.writeFileSync(
    path.join(fixture.root, 'scripts/ci/unbound-helper.mjs'),
    "import fs from 'node:fs';fs.writeFileSync(new URL('./unbound-marker',import.meta.url),'must-not-execute');\n"
  );
  const policyFile = path.join(fixture.root, 'scripts/ci/db-access-provider-unit-policy.json');
  const policy = JSON.parse(fs.readFileSync(policyFile)),
    bytes = fs.readFileSync(runtime);
  policy.producerFiles['scripts/ci/db-access-m4-compiled-runtime.mjs'] = {
    mode: '100644',
    bytes: bytes.length,
    sha256: digest(bytes),
  };
  fs.writeFileSync(policyFile, JSON.stringify(policy));
  const git = args =>
    execFileSync(
      '/usr/bin/git',
      ['-C', fixture.root, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
  git(['add', 'scripts']);
  git([
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '-qm',
    'freshly repinned unbound dependency negative',
  ]);
  const commit = git(['rev-parse', 'HEAD']),
    tree = git(['rev-parse', 'HEAD^{tree}']);
  git(['update-ref', 'refs/protected/main', commit]);
  Object.assign(fixture.options.context, {
    baseCommit: commit,
    headCommit: commit,
    candidateCommit: commit,
    candidateTree: tree,
    sourceCommit: commit,
    sourceTree: tree,
    protectedMain: commit,
  });
}
