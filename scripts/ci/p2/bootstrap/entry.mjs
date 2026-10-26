import { createRequire } from 'node:module';
if (
  process.version !== 'v24.15.0' ||
  process.platform !== 'linux' ||
  process.getuid() !== 65532 ||
  process.getgid() !== 65532
)
  throw Error('Fixed Linux runtime identity required');
// Docker injects its own non-secret container hostname; remove it before capsule evaluation.
delete process.env.HOSTNAME;
const allowedEnv = ['PATH', 'HOME', 'TMPDIR', 'TZ', 'LANG'];
for (const key of Object.keys(process.env))
  if (!allowedEnv.includes(key)) throw Error('Foreign environment');
if (process.send !== undefined) throw Error('Privileged IPC channel inherited');
// Fixed trusted bootstrap runs before any capsule module. TSYNC covers existing Node threads.
const restriction = createRequire(import.meta.url)('./p2-seccomp.node');
if (restriction.install() !== true) throw Error('Kernel restriction missing');
const mode = process.argv[2];
if (mode === 'suite') await import('/capsule/run-suite.mjs');
else if (mode === 'probe') {
  process.argv = [process.argv[0], '/capsule/probes-linux.mjs', ...process.argv.slice(3)];
  await import('/capsule/probes-linux.mjs');
} else if (mode === 'collector-control') {
  process.argv = [process.argv[0], '/capsule/collector-controls.mjs', ...process.argv.slice(3)];
  await import('/capsule/collector-controls.mjs');
} else if (mode === 'exec-control') {
  try {
    process.execve('/runtime/node', ['/runtime/node', '--version'], {});
    throw Error('Unexpected executable replacement');
  } catch (e) {
    if (e.code !== 'EPERM' && e.code !== 'EACCES') throw e;
    process.stdout.write(
      JSON.stringify({ probe: 'same-process-exec', denied: true, code: e.code }) + '\n'
    );
  }
} else if (mode === 'thread-control') {
  const { Worker } = await import('node:worker_threads');
  const worker = new Worker(
    "const {parentPort}=require('node:worker_threads');parentPort.postMessage(42)",
    { eval: true }
  );
  const value = await new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
  });
  if (value !== 42) throw Error('Thread positive control failed');
  await worker.terminate();
  process.stdout.write('{"threadControl":true}\n');
} else throw Error('Unknown fixed entry');
