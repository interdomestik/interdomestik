import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import tls from 'node:tls';
import {
  createM4RuntimeFixtureTls,
  validateM4RuntimeFixtureTls,
} from './db-access-m4-runtime-fixture-tls.mjs';

const first = createM4RuntimeFixtureTls();
const second = createM4RuntimeFixtureTls();

test('generated credentials are ephemeral and malformed, oversized or mismatched inputs refuse', () => {
  assert.notEqual(first.cert, second.cert);
  assert.equal(first.ca, first.cert);
  assert.equal(Object.isFrozen(first), true);
  for (const [key, cert] of [
    ['', first.cert],
    [first.key, 'not a certificate'],
    [second.key, first.cert],
    ['x'.repeat(16385), first.cert],
    [first.key, 'x'.repeat(16385)],
  ])
    assert.throws(() => validateM4RuntimeFixtureTls(key, cert), /M4 local TLS fixture refused/u);
});

test('local generated files are removed on return with no key or certificate output', () => {
  const temp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'm4-tls-test-'));
  const before = process.env.TMPDIR;
  try {
    process.env.TMPDIR = temp;
    const credentials = createM4RuntimeFixtureTls();
    assert.ok(credentials.key && credentials.cert);
    assert.deepEqual(fs.readdirSync(temp), []);
  } finally {
    if (before === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = before;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('loopback TLS validates the generated trust for DNS and IP and rejects unrelated trust', async () => {
  const server = tls.createServer({ key: first.key, cert: first.cert }, socket => socket.end('ok'));
  server.on('tlsClientError', () => {});
  await new Promise((resolve, reject) =>
    server.once('error', reject).listen(0, '127.0.0.1', resolve)
  );
  const port = server.address().port;
  function connect(options) {
    return new Promise((resolve, reject) => {
      const socket = tls.connect({ host: '127.0.0.1', port, ...options });
      socket.once('secureConnect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', reject);
    });
  }
  try {
    await connect({ ca: first.ca, servername: 'localhost' });
    await connect({ ca: first.ca });
    await assert.rejects(connect({ ca: second.ca, servername: 'localhost' }));
    await assert.rejects(connect({ ca: first.ca, servername: 'foreign.example' }));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
