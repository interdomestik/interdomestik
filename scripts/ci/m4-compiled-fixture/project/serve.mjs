// Qualification-only HTTPS Next handler. Parent authenticates this entry before evaluation.
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:https';
import { verifyImage, readOwned } from './image-custody.mjs';
const root = fs.realpathSync(import.meta.dirname);
if (
  process.env.NODE_OPTIONS ||
  process.env.NODE_PATH ||
  process.env.DATABASE_URL ||
  process.env.DATABASE_ADMIN_URL ||
  process.env.NODE_ENV !== 'production'
)
  throw Error('Isolated Next fixture environment required');
const image = verifyImage(root);
const port = Number(process.env.M4_COMPILED_FIXTURE_PORT);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
  throw Error('Fixed owned fixture port required');
const key = readOwned(process.env.M4_COMPILED_FIXTURE_TLS_KEY_FILE, 16384, true);
const cert = readOwned(process.env.M4_COMPILED_FIXTURE_TLS_CERT_FILE, 16384);
const { readPlan } = await import('./app/fixture-plan.js');
readPlan();
const { default: next } = await import('next');
const server = createServer({ key, cert, handshakeTimeout: 5000 });
const app = next({
  dev: false,
  dir: root,
  hostname: '127.0.0.1',
  port,
  httpServer: server,
  webpack: true,
});
const sockets = new Set(),
  retirements = new Set(),
  work = new Set();
let closing = false,
  stopping;
server.on('connection', socket => {
  const retired = new Promise(resolve => socket.once('close', resolve));
  sockets.add(socket);
  retirements.add(retired);
  void retired.then(() => {
    sockets.delete(socket);
    retirements.delete(retired);
  });
  if (closing || sockets.size > 32) socket.destroy();
});
server.requestTimeout = 15000;
server.headersTimeout = 5000;
server.setTimeout(15000, socket => socket.destroy());
await app.prepare();
const handler = app.getRequestHandler();
server.on('request', (request, response) => {
  if (closing) {
    response.writeHead(503).end();
    return;
  }
  const current = Promise.resolve()
    .then(() => handler(request, response))
    .catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    })
    .finally(() => work.delete(current));
  work.add(current);
});
function close() {
  if (stopping) return stopping;
  closing = true;
  stopping = (async () => {
    const deadline = setTimeout(() => {
      for (const socket of sockets) socket.destroy();
      process.exit(1);
    }, 10000);
    try {
      const stopped = new Promise((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      );
      for (const socket of sockets) socket.destroy();
      await Promise.all([stopped, ...work]);
      await Promise.all([...retirements]);
      await app.close();
      if (sockets.size || work.size || retirements.size)
        throw Error('Next fixture drain incomplete');
    } finally {
      clearTimeout(deadline);
    }
  })();
  return stopping;
}
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(
    signal,
    () =>
      void close().catch(() => {
        process.exitCode = 1;
      })
  );
await new Promise((resolve, reject) =>
  server.once('error', reject).listen(port, '127.0.0.1', resolve)
);
console.log(
  JSON.stringify({
    kind: 'm4-next-fixture-ready',
    origin: 'https://127.0.0.1:' + port,
    buildId: image.buildId,
    qualificationOnly: true,
    productionCCredit: 0,
  })
);
