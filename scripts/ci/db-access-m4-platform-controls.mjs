import fs from 'node:fs';
import { nativeProbeSource } from './db-access-m4-platform-native-source.mjs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { nextProfile, nextCommand } from './db-access-m4-platform-next.mjs';
import { runOwned } from './db-access-m4-platform-process.mjs';
import {
  writePrivate,
  imageSnapshot,
  sha,
  readFixed,
  fixedImageTool,
} from './db-access-m4-platform-custody.mjs';
import { platformTools, platformPythonPrefix } from './db-access-m4-platform-tools.mjs';

export function validateKernelRows(value, label, targets, aliases) {
  if (
    value?.label !== label ||
    value.actuallyRan !== true ||
    value.nodePermissionFlags !== false ||
    value.privateRead?.denied !== true ||
    value.inheritedCodeFds?.length !== 0 ||
    value.rows?.length !== 21 ||
    value.rows.some(row => row.denied !== true || row.unexpectedSuccess || row.setupFailure) ||
    value.data?.length !== 3 ||
    value.data.some(row => row !== true)
  )
    throw Error('Actual kernel execution row refused');
  const expected = targets
    .flatMap(file =>
      ['write-open', 'write', 'rename', 'chmod', 'file-link', 'unlink'].map(operation => ({
        file,
        operation,
      }))
    )
    .concat(aliases.map(file => ({ file, operation: 'symlink-alias-write-open' })));
  if (
    JSON.stringify(value.rows.map(({ file, operation }) => ({ file, operation }))) !==
    JSON.stringify(expected)
  )
    throw Error('Exact kernel operations and current image targets required');
}
export async function runKernelControls(state) {
  imageSnapshot(state.code, state.imagePin);
  const next = fixedImageTool(state, 'next');
  const targets = [
    path.join(state.code, 'm4-build-image.json'),
    path.join(state.code, '.next/build-manifest.json'),
    next,
  ];
  const before = targets.map(file => ({
    file,
    mode: fs.statSync(file).mode & 0o777,
    sha256: sha(readFixed(file)),
  }));
  const output = state.layout['next-logs'],
    tmp = state.nextTmp,
    cache = state.layout['next-cache'];
  const marker = writePrivate(state.layout['driver-evidence'], 'private-marker', randomBytes(32));
  const aliases = targets.map((file, index) => {
    const alias = path.join(output, 'code-alias-' + index);
    fs.symlinkSync(file, alias);
    return alias;
  });
  const nodeProbe = path.join(import.meta.dirname, 'db-access-m4-platform-kernel-probe.mjs');
  const nativeProbe = writePrivate(
    state.layout['driver-evidence'],
    'native-probe.py',
    nativeProbeSource
  );
  state.inputs.set(nativeProbe, sha(readFixed(nativeProbe)));
  const configFile = path.join(state.layout['driver-evidence'], 'kernel.json');
  const mapFiles = [cache, output, tmp].map(dir => path.join(dir, 'native-map-' + randomUUID()));
  let fd;
  try {
    for (const row of before) {
      fs.chmodSync(row.file, row.mode | 0o200);
      const calibration = fs.openSync(row.file, 'r+');
      fs.writeSync(calibration, Buffer.alloc(0));
      fs.closeSync(calibration);
    }
    const hardlink = path.join(output, 'hardlink-calibrator');
    fs.linkSync(targets[0], hardlink);
    try {
      if (fs.statSync(targets[0]).nlink !== 2) throw Error('Actual hardlink calibration');
    } finally {
      fs.unlinkSync(hardlink);
    }
    if (targets.some(file => fs.statSync(file).nlink !== 1))
      throw Error('Single-link launch precondition');
    fd = fs.openSync(targets[0], 'r+');
    const descriptor = fs.fstatSync(fd);
    for (const file of mapFiles)
      fs.copyFileSync(process.execPath, file, fs.constants.COPYFILE_EXCL);
    const config = {
      code: state.code,
      node: process.execPath,
      cache,
      output,
      tmp,
      preload: nodeProbe,
      nextPort: 49155,
      ownerPort: 49156,
      readFiles: [nativeProbe, configFile],
      python: platformTools.python,
      targets,
      aliases,
      mapFiles,
      privateMarker: marker,
      preopened: { dev: descriptor.dev, ino: descriptor.ino },
      descendantProfile: path.join(state.layout['driver-evidence'], 'kernel-descendant.sb'),
    };
    const profile = nextProfile(config);
    const baseFile = writePrivate(state.layout['driver-evidence'], 'kernel-base.sb', profile);
    const diagnostic =
      profile +
      '(allow process-fork)\n(allow process-exec (literal ' +
      JSON.stringify(platformTools.python) +
      '))\n(allow file-read* file-map-executable (subpath ' +
      JSON.stringify(platformPythonPrefix) +
      '))\n';
    writePrivate(state.layout['driver-evidence'], 'kernel-descendant.sb', diagnostic);
    writePrivate(state.layout['driver-evidence'], 'kernel.json', JSON.stringify(config));
    const nodeRun = async (profileFile, label) => {
      const run = await runOwned(
        {
          argv: [
            platformTools.sandbox,
            '-f',
            profileFile,
            process.execPath,
            '--disable-sigusr1',
            nodeProbe,
            configFile,
            label,
          ],
          cwd: state.code,
          env: state.cleanEnv,
        },
        state.deadlineAt
      );
      return JSON.parse(run.stdout.trim());
    };
    const base = await nodeRun(baseFile, 'base'),
      descendant = await nodeRun(config.descendantProfile, 'descendant');
    validateKernelRows(base, 'base', targets, aliases);
    validateKernelRows(base.worker, 'worker', targets, aliases);
    if (base.child?.error !== 'EPERM') throw Error('Actual base fork refusal required');
    validateKernelRows(descendant, 'descendant', targets, aliases);
    validateKernelRows(descendant.worker, 'worker', targets, aliases);
    if (descendant.child?.status !== 0) throw Error('Actual descendant process required');
    validateKernelRows(descendant.child.result, 'child', targets, aliases);
    const native = await runOwned(
      {
        argv: [
          platformTools.python,
          '-I',
          '-S',
          '-B',
          nativeProbe,
          configFile,
          'calibrate-and-protect',
        ],
        cwd: state.code,
        env: { ...state.cleanEnv, PYTHONDONTWRITEBYTECODE: '1' },
      },
      state.deadlineAt
    );
    const maps = JSON.parse(native.stdout.trim());
    if (
      maps.unconfinedRX !== 3 ||
      maps.explicitFDPositive !== true ||
      maps.closedFDNegative !== true ||
      maps.executedBytes !== false ||
      maps.protected?.rows?.length !== 4 ||
      maps.protected.rows[0].mappedRX !== true ||
      maps.protected.rows
        .slice(1)
        .some(
          row => row.denied !== true || row.mappedRX !== false || row.executedBytes !== false
        ) ||
      maps.protected.attrs?.length !== 3 ||
      maps.protected.attrs.some(row => row.denied !== true)
    )
      throw Error('Fresh native-map/xattr conjunction refused');
    return {
      denials: 105,
      contexts: [base, base.worker, descendant, descendant.worker, descendant.child.result],
      native: maps,
      profileSha256: sha(profile),
      diagnosticProfileSha256: sha(diagnostic),
      diagnosticForkGrantNotUsedByNext: true,
      fdPremise: 'spawn stdio only; trusted operator remains trusted',
    };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    for (const row of before) fs.chmodSync(row.file, row.mode);
    for (const file of [...aliases, ...mapFiles])
      if (fs.existsSync(file) || fs.lstatSync(path.dirname(file)).isDirectory()) {
        try {
          fs.unlinkSync(file);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
    imageSnapshot(state.code, state.imagePin);
  }
}

export async function runLoaderControls(state, ownerPort) {
  const command = nextCommand(state, 'good', 49157, ownerPort);
  const cache = writePrivate(
    state.layout['next-cache'],
    'unsealed.cjs',
    'throw Error("UNSEALED_EXECUTED");'
  );
  const foreign = writePrivate(state.nextTmp, 'unsealed.cjs', 'throw Error("UNSEALED_EXECUTED");');
  const cases = [
    [
      'cache-module',
      `await import(${JSON.stringify(pathToFileURL(cache).href)})`,
      'error.message==="Unsealed image module refused"',
    ],
    [
      'tmp-module',
      `await import(${JSON.stringify(pathToFileURL(foreign).href)})`,
      'error.message==="Unsealed image module refused"',
    ],
    [
      'cjs-cache',
      `const{createRequire}=await import('node:module');createRequire(${JSON.stringify(pathToFileURL(path.join(state.code, 'serve.mjs')).href)})(${JSON.stringify(cache)})`,
      'error.message==="Unsealed image module refused"',
    ],
    [
      'worker',
      `const{Worker}=await import('node:worker_threads');const w=new Worker('',{eval:true,execArgv:[]});await w.terminate()`,
      'error.code==="ERR_ACCESS_DENIED"&&error.permission==="WorkerThreads"',
    ],
    [
      'child',
      `const{spawnSync}=await import('node:child_process');const r=spawnSync('/usr/bin/true');if(r.error)throw r.error`,
      'error.code==="ERR_ACCESS_DENIED"&&error.permission==="ChildProcess"',
    ],
  ];
  const rows = [];
  for (const [kind, body, predicate] of cases) {
    const source = `let error;try{${body}}catch(e){error=e}if(!error||!(${predicate}))throw Error("Intended refusal missing");console.log(JSON.stringify({kind:${JSON.stringify(kind)},denied:true}));`;
    const result = await runOwned(
      {
        ...command,
        argv: [...command.argv.slice(0, -1), '--input-type=module', '--eval', source],
      },
      state.deadlineAt
    );
    const observed = JSON.parse(result.stdout.trim());
    if (observed.kind !== kind || observed.denied !== true)
      throw Error('Executed loader refusal mismatch');
    rows.push(observed);
  }
  return rows;
}
