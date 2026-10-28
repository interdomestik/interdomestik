import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { exact, hash, refuse } from './db-access-provider-runtime-identity.mjs';
import { installCrmPackages } from './db-access-crm-runtime-packages.mjs';
const fail = reason => refuse('crm materialization: ' + reason);
const BUNDLE = 'crm-runtime.cjs';
const METAFILE = 'crm-runtime-metafile.json';
function verifyClosure(root, runtime) {
  const metafile = JSON.parse(fs.readFileSync(path.join(root, METAFILE)));
  const inputs = Object.keys(metafile.inputs).sort();
  const expected = [runtime.entryFile, ...runtime.expectedInputs].sort();
  if (
    new Set(expected).size !== expected.length ||
    JSON.stringify(inputs) !== JSON.stringify(expected)
  )
    fail('input closure');
  const external = new Set(runtime.externalSpecifiers);
  for (const [file, record] of Object.entries(metafile.inputs))
    for (const imported of record.imports ?? []) {
      if (imported.external) {
        if (
          !external.has(imported.path) &&
          !(runtime.erasedTypeImports?.[file] ?? []).includes(imported.path)
        )
          fail('unexpected external ' + imported.path);
      } else if (!Object.hasOwn(metafile.inputs, imported.path)) {
        fail('unresolved import ' + file + ' -> ' + imported.path);
      }
    }
  const outputs = Object.entries(metafile.outputs);
  if (outputs.length !== 1 || outputs[0][0] !== BUNDLE) fail('output shape');
  for (const imported of outputs[0][1].imports ?? [])
    if (!imported.external || !external.has(imported.path))
      fail('unexpected bundle import ' + imported.path);
  if (outputs[0][1].entryPoint !== runtime.entryFile) fail('output entry');
  return hash(JSON.stringify(metafile));
}

export function materializeCrmRuntime({
  sourceRoot,
  producerRoot,
  outputRoot,
  tarballRoot,
  policy,
}) {
  const runtime = policy.crmProof?.runtime;
  if (!runtime) fail('mandatory runtime contract missing');
  const config = runtime.configuration;
  if (
    config.compilerVersion !== '0.28.2' ||
    config.platform !== 'node' ||
    config.format !== 'cjs' ||
    config.target !== 'node24'
  )
    fail('compiler configuration');
  const root = path.join(outputRoot, 'crm');
  fs.mkdirSync(root);
  const lockFile = 'scripts/ci/db-access-crm-runtime-lock.json';
  const lockBytes = exact(producerRoot, lockFile, policy.producerFiles[lockFile]);
  const lock = JSON.parse(lockBytes);
  if (!lock.packageFiles || Object.keys(lock.packageFiles).length !== 3)
    fail('lock package shards');
  lock.packages = {};
  for (const [file, record] of Object.entries(lock.packageFiles)) {
    if (!/^scripts\/ci\/db-access-crm-runtime-packages-[123]\.json$/u.test(file))
      fail('lock shard path');
    const shard = JSON.parse(exact(producerRoot, file, record));
    for (const [id, entry] of Object.entries(shard)) {
      if (Object.hasOwn(lock.packages, id)) fail('duplicate package slot');
      lock.packages[id] = entry;
    }
  }
  const installed = installCrmPackages({ lock, sourceRoot, root, tarballRoot });
  const copied = {};
  for (const [file, expected] of Object.entries({
    ...runtime.files,
    ...config.files,
    ...runtime.migrations,
  })) {
    if (!file.startsWith('apps/') && !file.startsWith('packages/')) fail('candidate copy scope');
    const bytes = exact(sourceRoot, file, expected);
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    copied[file] = hash(bytes);
  }
  fs.writeFileSync(path.join(root, 'package.json'), '{"private":true,"type":"module"}\n');
  const entry = exact(
    producerRoot,
    'scripts/ci/' + runtime.entryFile,
    policy.producerFiles['scripts/ci/' + runtime.entryFile]
  );
  if (runtime.entryFile !== 'db-access-crm-runtime-entry.ts') fail('entry identity');
  fs.writeFileSync(path.join(root, runtime.entryFile), entry);
  const env = {
    PATH: '/usr/bin:/bin',
    HOME: path.join(outputRoot, 'home'),
    TZ: 'UTC',
    LANG: 'C',
  };
  const run = args =>
    execFileSync(installed.compiler.binary, args, {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 64 * 1024 * 1024,
    });
  if (run(['--version']).trim() !== config.compilerVersion) fail('compiler version');
  const diagnostics = run([
    '--bundle',
    './' + runtime.entryFile,
    '--outfile=' + BUNDLE,
    '--metafile=' + METAFILE,
    '--platform=node',
    '--format=cjs',
    '--target=node24',
    '--tsconfig=' + config.tsconfigFile,
    '--log-level=error',
    '--color=false',
    '--alias:@interdomestik/domain-crm=' + path.join(root, 'packages/domain-crm/src'),
    '--alias:@interdomestik/database=' + path.join(root, 'packages/database/src'),
    '--alias:@interdomestik/domain-users=' + path.join(root, 'packages/domain-users/src'),
    '--alias:@interdomestik/shared-auth=' + path.join(root, 'packages/shared-auth/src'),
    '--alias:@interdomestik/domain-recovery=' + path.join(root, 'packages/domain-recovery/src'),
    '--alias:@interdomestik/domain-case=' + path.join(root, 'packages/domain-case/src'),
    ...runtime.externalSpecifiers.map(name => '--external:' + name),
  ]);
  if (diagnostics.trim()) fail('compiler output');
  const metafileSha256 = verifyClosure(root, runtime);
  return {
    root,
    copied,
    packages: installed.packages,
    patches: installed.patches,
    dependencyGraphSha256: installed.lock.graphSha256,
    lockSha256: hash(lockBytes),
    entrySha256: hash(entry),
    compilerVersion: config.compilerVersion,
    metafileSha256,
    bundleSha256: hash(fs.readFileSync(path.join(root, BUNDLE))),
    runtimeAdmission: false,
  };
}
