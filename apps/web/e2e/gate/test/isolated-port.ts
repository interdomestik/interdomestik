import { createServer, type Server } from 'node:net';

// The shared development app and database ports; the isolated runtime never takes either.
const FORBIDDEN_PORTS = new Set([3000, 54322]);

async function listenOnEphemeralPort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('isolated expiry port missing');
  return { server, port: address.port };
}

export async function freePort() {
  // A forbidden port stays held while the next one is drawn, so the system cannot return it again.
  const held: Server[] = [];
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = await listenOnEphemeralPort();
      held.push(candidate.server);
      if (!FORBIDDEN_PORTS.has(candidate.port)) return candidate.port;
    }
    throw new Error('isolated expiry port allocation kept returning a forbidden port');
  } finally {
    await Promise.all(
      held.map(
        server =>
          new Promise<void>((resolve, reject) =>
            server.close(error => (error ? reject(error) : resolve()))
          )
      )
    );
  } // Binding race fails startup; teardown never targets another listener.
}
