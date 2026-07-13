import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

import { createConsoleServer } from './app.mjs';

export function parsePort(value) {
  if (value === undefined) return 4177;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('PORT must be an integer from 1024 to 65535.');
  }
  return port;
}

export async function startConsoleServer({
  port = parsePort(process.env.PORT),
  portalHandler,
} = {}) {
  const server = createConsoleServer({ portalHandler });
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await startConsoleServer();
  console.log(`http://127.0.0.1:${server.address().port}`);
}
