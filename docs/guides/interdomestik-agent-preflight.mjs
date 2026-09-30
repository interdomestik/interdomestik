import assert from 'node:assert/strict';
import { createConnection, createServer } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// This is a local launch diagnostic, not SQL/RLS evidence or a port reservation.
export function configuration(env, expectedPort, resolveNetwork) {
  assert.match(String(expectedPort), /^\d+$/, 'expected task port is required');
  assert.ok(env.PW_PORT, 'PW_PORT must be explicit before orchestration');
  const network = resolveNetwork(env);
  assert.equal(network.PORT, Number(expectedPort), 'browser port differs from allocated task port');
  if (env.PORT) assert.equal(Number(env.PORT), network.PORT, 'PORT and PW_PORT disagree');
  for (const key of ['BILLING_TEST_MODE', 'NEXT_PUBLIC_BILLING_TEST_MODE']) {
    assert.ok(
      !['1', 'true'].includes(env[key]?.toLowerCase()),
      `${key} must be lane-owned, not global`
    );
  }
  const endpoints = [];
  for (const key of [
    'DATABASE_URL',
    'DATABASE_URL_RLS',
    'E2E_DATABASE_URL',
    'E2E_DATABASE_URL_RLS',
  ]) {
    if (key.startsWith('E2E_') && !env[key]) continue;
    assert.ok(env[key], `${key} must be explicit`);
    let url;
    try {
      url = new URL(env[key]);
    } catch {
      throw new Error(`${key} is invalid`);
    }
    assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), `${key} must be PostgreSQL`);
    assert.ok(
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
      `${key} must target loopback`
    );
    assert.ok(url.pathname.length > 1, `${key} needs an explicit database`);
    const endpoint = {
      host: url.hostname === '[::1]' ? '::1' : url.hostname,
      port: Number(url.port || 5432),
    };
    endpoints.push({ ...endpoint, identity: `${endpoint.host}:${endpoint.port}${url.pathname}` });
  }
  assert.ok(
    endpoints.every(x => x.identity === endpoints[0].identity),
    'application and E2E DB targets differ'
  );
  return { appHost: network.BIND_HOST, appPort: network.PORT, database: endpoints[0] };
}

export async function probe(config) {
  await new Promise((resolveProbe, reject) => {
    const socket = createConnection({ host: config.database.host, port: config.database.port });
    const finish = error => {
      socket.destroy();
      error ? reject(error) : resolveProbe();
    };
    socket.setTimeout(1500, () => finish(new Error('loopback DB TCP probe timed out')));
    socket.once('error', () => finish(new Error('loopback DB TCP probe failed')));
    socket.once('connect', () => finish());
  });
  await new Promise((resolveProbe, reject) => {
    const server = createServer();
    server.once('error', () =>
      reject(new Error('task app port is occupied or binding is not permitted'))
    );
    server.listen(config.appPort, config.appHost, () => server.close(resolveProbe));
  });
  return {
    status: 'pass',
    taskPort: config.appPort,
    databaseTcp: 'reachable',
    appPort: 'free',
    sqlAndRlsVerified: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    assert.equal(
      process.argv[2],
      '--expected-port',
      'usage: preflight --expected-port <allocated-port>'
    );
    const { resolvePlaywrightNetwork } = await import(
      pathToFileURL(resolve('apps/web/playwright-network.ts'))
    );
    const config = configuration(process.env, process.argv[3], resolvePlaywrightNetwork);
    console.log(JSON.stringify(await probe(config)));
  } catch (error) {
    // Assertion messages are deliberate and never include connection strings.
    console.error(
      `Preflight failed: ${error instanceof assert.AssertionError ? error.message.split('\n')[0] : error.message}`
    );
    process.exitCode = 1;
  }
}
