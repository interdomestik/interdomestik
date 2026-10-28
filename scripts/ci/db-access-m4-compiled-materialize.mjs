import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { exact, hash } from './db-access-provider-runtime-identity.mjs';
import { installCrmPackages } from './db-access-crm-runtime-packages.mjs';
import { M4_COMPILED_RUNTIME_CONTRACT as contract } from './db-access-m4-compiled-runtime-contract.mjs';
import { verifyM4CompiledBackendMetafile } from './db-access-m4-compiled-backend-closure.mjs';
import { verifyM4RuntimeTlsSourceRoot } from './db-access-m4-runtime-closure.mjs';
import { sealM4Image } from './db-access-m4-runtime-seal.mjs';
const fail = reason => {
  throw Error('M4 strict ESM materialization refused: ' + reason);
};

export function materializeM4CompiledBackend({
  sourceRoot,
  producerRoot,
  outputRoot,
  tarballRoot,
  policy,
  deadlineAt,
}) {
  const base = fs.realpathSync(outputRoot);
  for (const input of [sourceRoot, producerRoot].map(x => fs.realpathSync(x)))
    if (base === input || base.startsWith(input + path.sep)) fail('output isolation');
  const remaining = () => {
    const value = Math.floor(deadlineAt - performance.now());
    if (!Number.isSafeInteger(value) || value <= 0) fail('execution deadline');
    return value;
  };
  remaining();
  const tlsSourceBinding = verifyM4RuntimeTlsSourceRoot(sourceRoot, contract);
  const root = path.join(base, 'm4-compiled-backend');
  fs.mkdirSync(root, { mode: 0o700 });
  const lockFile = 'scripts/ci/db-access-crm-runtime-lock.json';
  const lock = JSON.parse(exact(producerRoot, lockFile, contract.packageLock[lockFile]));
  lock.packages = {};
  if (
    Object.keys(lock.packageFiles).sort().join('|') !==
    Object.keys(contract.packageLock)
      .filter(x => x !== lockFile)
      .sort()
      .join('|')
  )
    fail('fixed package shard set');
  for (const [file, descriptor] of Object.entries(lock.packageFiles)) {
    for (const key of ['sha256', 'bytes', 'mode'])
      if (descriptor[key] !== contract.packageLock[file]?.[key]) fail('package shard binding');
    for (const [name, value] of Object.entries(JSON.parse(exact(producerRoot, file, descriptor)))) {
      if (Object.hasOwn(lock.packages, name)) fail('duplicate package');
      lock.packages[name] = value;
    }
  }
  const installed = installCrmPackages({ lock, sourceRoot, root, tarballRoot });
  remaining();
  for (const [file, descriptor] of Object.entries({
    ...contract.files,
    ...contract.configuration,
    ...contract.migrations,
  })) {
    if (!file.startsWith('apps/') && !file.startsWith('packages/')) fail('candidate copy scope');
    const bytes = exact(sourceRoot, file, descriptor),
      target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  for (const name of [contract.entryFile, ...contract.childFiles]) {
    if (
      !/^(?:db-access-[a-z0-9.-]+\.(?:mjs|ts|json)|m4-compiled-fixture\/(?:package-graph|preparation-custody|prepare-build|seal-build|source-bookends)\.mjs|m4-compiled-fixture\/project\/(?:image-custody|browser-output)\.mjs)$/u.test(
        name
      )
    )
      fail('fixed child name');
    const file = 'scripts/ci/' + name;
    const destination = path.join(root, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, exact(producerRoot, file, policy.producerFiles[file]));
  }
  const compilerContractFile = 'scripts/ci/db-access-m4-worker-loader-contract.json';
  const dependency = JSON.parse(
    exact(producerRoot, compilerContractFile, policy.producerFiles[compilerContractFile])
  ).dependency;
  if (
    dependency.name !== 'typescript' ||
    dependency.version !== '5.9.3' ||
    Object.keys(dependency.files).length !== 132 ||
    dependency.lockfile.sha256 !== policy.resolverFiles[dependency.lockfile.path]?.sha256
  )
    fail('fixed compiled-source parser dependency');
  const compilerRoot = path.join(root, 'node_modules/typescript');
  if (fs.existsSync(compilerRoot)) fail('unexpected compiler namespace');
  for (const [relative, record] of Object.entries(dependency.files)) {
    if (relative.split('/').some(part => !part || part === '.' || part === '..'))
      fail('compiler leaf scope');
    const file = 'node_modules/typescript/' + relative;
    const destination = path.join(compilerRoot, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, exact(producerRoot, file, record), {
      flag: 'wx',
      mode: record.mode,
    });
  }
  fs.writeFileSync(path.join(root, 'package.json'), '{"private":true,"type":"module"}\n');
  for (const name of ['home', 'tmp', 'results'])
    fs.mkdirSync(path.join(root, name), { mode: 0o700 });
  const run = args =>
    execFileSync(installed.compiler.binary, args, {
      cwd: root,
      encoding: 'utf8',
      timeout: Math.min(120000, remaining()),
      maxBuffer: 8 * 1024 * 1024,
      env: {
        PATH: '/usr/bin:/bin',
        HOME: path.join(root, 'home'),
        TZ: 'UTC',
        LANG: 'C',
      },
    });
  if (run(['--version']).trim() !== contract.compilerVersion) fail('compiler version');
  const output = run([
    '--bundle',
    contract.entryFile,
    '--outfile=' + contract.outputFile,
    '--metafile=' + contract.metafile,
    '--platform=node',
    '--format=esm',
    '--target=node24',
    '--tsconfig=' + contract.tsconfigFile,
    '--log-level=error',
    '--color=false',
    ...contract.aliases.map(
      name => '--alias:@interdomestik/' + name + '=' + path.join(root, 'packages', name, 'src')
    ),
    ...contract.externalSpecifiers.map(name => '--external:' + name),
  ]);
  if (output.trim()) fail('compiler diagnostics');
  const metafile = JSON.parse(fs.readFileSync(path.join(root, contract.metafile), 'utf8'));
  const metafileSha256 = verifyM4CompiledBackendMetafile(metafile);
  remaining();
  return Object.freeze({
    root,
    installed,
    tlsSourceBinding,
    metafileSha256,
    bundleSha256: hash(fs.readFileSync(path.join(root, contract.outputFile))),
    image: sealM4Image(root),
    runtimeAdmission: false,
    nativeAdmission: false,
  });
}
