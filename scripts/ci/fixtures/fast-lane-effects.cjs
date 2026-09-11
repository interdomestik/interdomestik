// Test-only tripwires inherited by the fast command and every Node child.
const { createRequire, syncBuiltinESMExports } = require('node:module');
const net = require('node:net');
const tls = require('node:tls');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const cp = require('node:child_process');
const { resolve } = require('node:path');
const isFastRunner = process.argv[1] === resolve(__dirname, '../../check-fast.mjs');
const blockedEnvironment = ['NODE_OPTIONS', 'NODE_PATH', 'LD_PRELOAD', 'BASH_ENV'];
if (isFastRunner) {
  // Inject after Node startup so this tests the runner's child boundary, not Node itself.
  for (const key of blockedEnvironment) process.env[key] = 'forbidden-fast-lane-fixture';
}
const tsxRequire = createRequire(require.resolve('tsx/package.json'));
const esbuildRequire = createRequire(tsxRequire.resolve('esbuild/package.json'));
const esbuildBinary = esbuildRequire.resolve(
  `@esbuild/${process.platform}-${process.arch}/${process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild'}`
);
const esbuildVersion = esbuildRequire('./package.json').version;
const deny = name => () => {
  throw new Error(`FAST_LANE_FORBIDDEN_EFFECT: ${name}`);
};
net.Socket.prototype.connect = deny('network');
net.Server.prototype.listen = deny('listener');
tls.connect = deny('TLS');
http.request = https.request = deny('HTTP');
globalThis.fetch = deny('fetch');
process.kill = deny('kill');
for (const method of ['rm', 'rmSync', 'rmdir', 'rmdirSync', 'unlink', 'unlinkSync']) {
  fs[method] = deny('delete');
}
for (const method of ['rm', 'rmdir', 'unlink']) fs.promises[method] = deny('delete');
for (const method of ['spawn', 'spawnSync', 'execFile', 'execFileSync']) {
  const original = cp[method];
  cp[method] = (file, args, options, ...rest) => {
    // Cold tsx loads use this exact installed, stdin-driven TypeScript transformer.
    if (
      method === 'spawn' &&
      file === esbuildBinary &&
      !options?.shell &&
      args.length === 2 &&
      args[0] === `--service=${esbuildVersion}` &&
      args[1] === '--ping'
    ) {
      process.stdout.write('FAST_LANE_TRANSFORM esbuild\n');
      return original(file, args, options, ...rest);
    }
    if (file !== process.execPath || options?.shell) return deny('external command')();
    if (isFastRunner && blockedEnvironment.some(key => Object.hasOwn(options.env, key))) {
      return deny('inherited execution control')();
    }
    if (isFastRunner && options.timeout !== 30_000) return deny('unbounded child')();
    if (isFastRunner && process.env.FAST_LANE_TEST_TIMEOUT === '1') {
      return { status: null, error: { code: 'ETIMEDOUT' }, signal: 'SIGTERM' };
    }
    process.stdout.write(`FAST_LANE_COMMAND ${JSON.stringify(args)}\n`);
    // Only this test preload propagates instrumentation; production children have no hook.
    const instrumented = {
      ...options,
      env: {
        ...(options?.env ?? process.env),
        NODE_OPTIONS: `--require=${__filename}`,
        TSX_DISABLE_CACHE: '1',
      },
    };
    return original(file, args, instrumented, ...rest);
  };
}
cp.exec = cp.execSync = deny('shell');
syncBuiltinESMExports();
