import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { exact, hash } from './db-access-provider-runtime-identity.mjs';
import { installCrmPackages } from './db-access-crm-runtime-packages.mjs';
import { M4_RUNTIME_CONTRACT as contract } from './db-access-m4-runtime-contract.mjs';
import { verifyM4Metafile, verifyM4RuntimeTlsSourceRoot } from './db-access-m4-runtime-closure.mjs';
import { sealM4Image } from './db-access-m4-runtime-seal.mjs';
const fail = reason => {
  throw Error('M4 materialization refused: ' + reason);
};
export function materializeM4Runtime({
  sourceRoot,
  producerRoot,
  outputRoot,
  tarballRoot,
  policy,
}) {
  const assemblyBase = fs.realpathSync(outputRoot);
  for (const input of [fs.realpathSync(sourceRoot), fs.realpathSync(producerRoot)])
    if (assemblyBase === input || assemblyBase.startsWith(input + path.sep))
      fail('output isolation');
  // Exact source authentication and the approved TLS law precede all copy/build work.
  const tlsSourceBinding = verifyM4RuntimeTlsSourceRoot(sourceRoot, contract);
  const root = path.join(assemblyBase, 'm4');
  fs.mkdirSync(root, { mode: 0o700 });
  const lockFile = 'scripts/ci/db-access-crm-runtime-lock.json';
  const lockBytes = exact(producerRoot, lockFile, contract.packageLock[lockFile]);
  const lock = JSON.parse(lockBytes);
  lock.packages = {};
  if (
    Object.keys(lock.packageFiles ?? {})
      .sort()
      .join('|') !==
    Object.keys(contract.packageLock)
      .filter(x => x !== lockFile)
      .sort()
      .join('|')
  )
    fail('fixed lock shard set');
  for (const [file, expected] of Object.entries(lock.packageFiles)) {
    if (JSON.stringify(expected) !== JSON.stringify(contract.packageLock[file])) {
      for (const key of ['mode', 'bytes', 'sha256'])
        if (expected[key] !== contract.packageLock[file][key]) fail('fixed lock shard identity');
    }
    const entries = JSON.parse(exact(producerRoot, file, expected));
    for (const [id, entry] of Object.entries(entries)) {
      if (Object.hasOwn(lock.packages, id)) fail('duplicate package slot');
      lock.packages[id] = entry;
    }
  }
  const installed = installCrmPackages({ lock, sourceRoot, root, tarballRoot });
  const copied = {};
  for (const [file, expected] of Object.entries({
    ...contract.files,
    ...contract.configuration,
    ...contract.migrations,
  })) {
    if (!file.startsWith('apps/') && !file.startsWith('packages/')) fail('candidate copy scope');
    const bytes = exact(sourceRoot, file, expected),
      target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    copied[file] = hash(bytes);
  }
  for (const name of [contract.entryFile, ...contract.childFiles, ...contract.fixtureFiles]) {
    if (!/^[a-z0-9.-]+\.(?:mjs|mts|ts|json)$/u.test(name)) fail('producer child path');
    const file = 'scripts/ci/' + name,
      bytes = exact(producerRoot, file, policy.producerFiles[file]);
    fs.writeFileSync(path.join(root, name), bytes);
    copied[file] = hash(bytes);
  }
  fs.writeFileSync(path.join(root, 'package.json'), '{"private":true,"type":"module"}\n');
  for (const name of ['home', 'tmp', 'results'])
    fs.mkdirSync(path.join(root, name), { recursive: true, mode: 0o700 });
  const run = args =>
    execFileSync(installed.compiler.binary, args, {
      cwd: root,
      env: { PATH: '/usr/bin:/bin', HOME: path.join(root, 'home'), TZ: 'UTC', LANG: 'C' },
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024,
    });
  if (run(['--version']).trim() !== contract.compilerVersion) fail('compiler version');
  const output = run([
    '--bundle',
    contract.entryFile,
    '--outfile=m4-runtime.cjs',
    '--metafile=m4-runtime-metafile.json',
    '--platform=node',
    '--format=cjs',
    '--target=node24',
    '--tsconfig=' + contract.tsconfigFile,
    '--log-level=error',
    '--color=false',
    // Only the Next revalidation import is substituted in this local qualification image.
    // Adapter bodies remain exact; the fixed observer proves calls, never Next deployment.
    '--alias:next/cache=' + path.join(root, 'db-access-m4-runtime-cache-observer.ts'),
    ...contract.aliases.map(
      name => '--alias:@interdomestik/' + name + '=' + path.join(root, 'packages', name, 'src')
    ),
    ...contract.externalSpecifiers.map(x => '--external:' + x),
  ]);
  if (output.trim()) fail('compiler diagnostics');
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'm4-runtime-metafile.json'), 'utf8'));
  const metafileSha256 = verifyM4Metafile(meta, contract),
    image = sealM4Image(root);
  return {
    root,
    copied,
    installed,
    metafileSha256,
    tlsSourceBinding,
    bundleSha256: hash(fs.readFileSync(path.join(root, 'm4-runtime.cjs'))),
    image,
    runtimeAdmission: false,
  };
}
