import fs from 'node:fs';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const [
  probe,
  privatePath,
  evidencePath,
  modulePath,
  nodePath,
  endpoint,
  inheritedFd,
  inheritedDev,
  inheritedIno,
] = process.argv.slice(2);
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
const deniedCodes = new Set(['EPERM', 'EACCES']);
async function mustDeny(action) {
  try {
    await action();
    throw new Error('Unexpected capability recovery');
  } catch (error) {
    const hiddenModule =
      (probe === 'actual-module-import' && error?.code === 'ERR_MODULE_NOT_FOUND') ||
      (probe === 'actual-module-require' && error?.code === 'MODULE_NOT_FOUND');
    if (!deniedCodes.has(error?.code) && !hiddenModule) throw error;
    emit({ probe, denied: true, code: error.code });
  }
}
if (probe === 'private-file') await mustDeny(() => fs.readFileSync(privatePath));
else if (probe === 'protected-evidence')
  await mustDeny(() => fs.writeFileSync(evidencePath, 'tampered'));
else if (probe === 'capsule-write')
  await mustDeny(() => fs.writeFileSync(new URL('./coldstart.mjs', import.meta.url), 'tampered'));
else if (probe === 'actual-module-read') await mustDeny(() => fs.readFileSync(modulePath));
else if (probe === 'actual-module-import')
  await mustDeny(() => import(pathToFileURL(modulePath).href));
else if (probe === 'actual-module-require')
  await mustDeny(() => createRequire(import.meta.url)(modulePath));
else if (probe === 'actual-module-realpath') await mustDeny(() => fs.realpathSync(modulePath));
else if (probe === 'constructor-recovery') {
  const recovered = {}.constructor.constructor('return process')();
  if (recovered !== process) throw Error('Constructor recovery control not reached');
  await mustDeny(() => recovered.getBuiltinModule('fs').readFileSync(privatePath));
} else if (probe === 'spawn') {
  const result = spawnSync(nodePath, ['--version'], { encoding: 'utf8', timeout: 1000 });
  if (!deniedCodes.has(result.error?.code)) throw Error('Child process recovery was not denied');
  emit({ probe, denied: true, code: result.error.code });
} else if (probe === 'tcp4' || probe === 'tcp6' || probe === 'unix') {
  await mustDeny(
    () =>
      new Promise((resolve, reject) => {
        const connection =
          probe === 'unix'
            ? net.connect({ path: endpoint })
            : net.connect({ host: probe === 'tcp4' ? '127.0.0.1' : '::1', port: Number(endpoint) });
        connection.setTimeout(1000, () => {
          connection.destroy();
          reject(Error('No OS denial before timeout'));
        });
        connection.once('connect', () => {
          connection.destroy();
          resolve();
        });
        connection.once('error', reject);
      })
  );
} else if (probe === 'inherited-descriptor') {
  let same = false,
    code = 'DIFFERENT_INTERNAL_DESCRIPTOR';
  try {
    const stat = fs.fstatSync(Number(inheritedFd));
    same = String(stat.dev) === inheritedDev && String(stat.ino) === inheritedIno;
  } catch (error) {
    if (error?.code !== 'EBADF') throw error;
    code = 'EBADF';
  }
  if (same) throw Error('Inherited private descriptor recovered');
  emit({ probe, denied: true, code });
} else if (probe === 'scratch') {
  fs.writeFileSync(process.env.TMPDIR + '/scratch-control.txt', 'permitted scratch only');
  emit({ probe, value: fs.readFileSync(process.env.TMPDIR + '/scratch-control.txt', 'utf8') });
} else if (probe === 'environment') {
  if (Object.keys(process.env).some(k => !['PATH', 'HOME', 'TMPDIR', 'TZ', 'LANG'].includes(k)))
    throw Error('Foreign environment inherited');
  if (process.send !== undefined) throw Error('Node IPC channel inherited');
  emit({ probe, keys: Object.keys(process.env).sort(), ipc: false });
} else if (probe === 'global-mutation-forgery') {
  Date.now = () => 0;
  JSON.stringify = () => '{"checksPassed":true,"nativeAdmission":true,"sourceSha256":"forged"}';
  Object.prototype.producerApproved = true;
  process.stdout.write(JSON.stringify({ ignored: true }) + '\n');
} else throw Error('Unknown fixed probe');
