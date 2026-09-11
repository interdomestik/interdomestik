// Test-only tripwires inherited by the fast command and every Node child.
const { syncBuiltinESMExports } = require('node:module');
const net = require('node:net');
const tls = require('node:tls');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const cp = require('node:child_process');
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
    if (file !== process.execPath || options?.shell) return deny('external command')();
    process.stdout.write(`FAST_LANE_COMMAND ${JSON.stringify(args)}\n`);
    return original(file, args, options, ...rest);
  };
}
cp.exec = cp.execSync = deny('shell');
syncBuiltinESMExports();
