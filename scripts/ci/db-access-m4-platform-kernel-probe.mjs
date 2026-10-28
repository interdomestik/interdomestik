import fs from 'node:fs';
import { Worker, isMainThread, workerData, parentPort } from 'node:worker_threads';
import { spawnSync } from 'node:child_process';
const config = isMainThread
  ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  : workerData.config;
const deniedCodes = new Set(['EPERM', 'EACCES']);
function mutation(file, operation, fn) {
  if (!fs.existsSync(file)) return { file, operation, setupFailure: 'missing-target' };
  try {
    fn();
    return { file, operation, unexpectedSuccess: true };
  } catch (error) {
    return {
      file,
      operation,
      denied: deniedCodes.has(error.code),
      code: error.code,
    };
  }
}
function run(label) {
  const rows = [];
  for (const file of config.targets) {
    rows.push(mutation(file, 'write-open', () => fs.closeSync(fs.openSync(file, 'r+'))));
    rows.push(mutation(file, 'write', () => fs.appendFileSync(file, Buffer.alloc(0))));
    rows.push(
      mutation(file, 'rename', () => {
        fs.renameSync(file, file + '.renamed');
        fs.renameSync(file + '.renamed', file);
      })
    );
    rows.push(mutation(file, 'chmod', () => fs.chmodSync(file, fs.statSync(file).mode & 0o777)));
    rows.push(
      mutation(file, 'file-link', () => {
        const alias = config.output + '/link-' + label;
        fs.linkSync(file, alias);
        fs.unlinkSync(alias);
      })
    );
    rows.push(mutation(file, 'unlink', () => fs.unlinkSync(file)));
  }
  for (const file of config.aliases)
    rows.push(
      mutation(file, 'symlink-alias-write-open', () => fs.closeSync(fs.openSync(file, 'r+')))
    );
  const data = [];
  for (const root of [config.cache, config.output, config.tmp]) {
    const file = root + '/data-' + label + '-' + process.pid;
    try {
      fs.writeFileSync(file, 'ok');
      data.push(fs.readFileSync(file, 'utf8') === 'ok');
      fs.unlinkSync(file);
    } catch (error) {
      data.push({ setupFailure: error.code });
    }
  }
  const fds = [];
  for (let fd = 0; fd < 256; fd++) {
    try {
      const s = fs.fstatSync(fd);
      fds.push({ fd, dev: s.dev, ino: s.ino });
    } catch {}
  }
  const inherited = fds.filter(
    x => x.dev === config.preopened.dev && x.ino === config.preopened.ino
  );
  let privateRead;
  try {
    const bytes = fs.readFileSync(config.privateMarker);
    privateRead = { unexpectedSuccess: true, byteLength: bytes.length };
    bytes.fill(0);
  } catch (error) {
    privateRead = { denied: deniedCodes.has(error.code), code: error.code };
  }
  return {
    label,
    privateRead,
    actuallyRan: true,
    pid: process.pid,
    isMainThread,
    execArgv: process.execArgv,
    nodeOptions: process.env.NODE_OPTIONS ?? null,
    nodePermissionFlags: process.execArgv.some(x => /permission|allow-fs|allow-worker/.test(x)),
    rows,
    data,
    fds,
    inheritedCodeFds: inherited,
  };
}
if (!isMainThread) parentPort.postMessage(run('worker'));
else {
  const label = process.argv[3] ?? 'base';
  const result = run(label);
  if (label !== 'child') {
    try {
      result.worker = await new Promise((resolve, reject) => {
        const w = new Worker(new URL(import.meta.url), {
          execArgv: [],
          workerData: { config },
        });
        w.once('message', resolve);
        w.once('error', reject);
        w.once('exit', code => {
          if (code) reject(Error('worker exit ' + code));
        });
      });
    } catch (error) {
      result.worker = {
        setupFailure: error.code ?? error.message,
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }
    const child = spawnSync(process.execPath, [import.meta.filename, process.argv[2], 'child'], {
      encoding: 'utf8',
      env: process.env,
    });
    result.child = {
      status: child.status,
      error: child.error?.code ?? null,
      stderr: child.stderr?.slice(0, 1000),
    };
    if (child.status === 0) {
      try {
        result.child.result = JSON.parse(child.stdout);
      } catch {
        result.child.setupFailure = 'invalid-json';
      }
    }
  }
  console.log(JSON.stringify(result));
}
