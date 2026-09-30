import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';
import { configuration, probe } from './interdomestik-agent-preflight.mjs';
import { resolvePlaywrightNetwork } from '../../apps/web/playwright-network.ts';

const env = {
  PW_PORT: '3100',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:55432/test',
  DATABASE_URL_RLS: 'postgresql://rls:test@127.0.0.1:55432/test',
};
test('uses the real resolver and rejects the observed early/late port mismatch', () => {
  assert.equal(configuration(env, '3100', resolvePlaywrightNetwork).appPort, 3100);
  assert.throws(
    () => configuration({ ...env, PORT: '3000' }, '3100', resolvePlaywrightNetwork),
    /disagree/
  );
  assert.throws(
    () => configuration({ ...env, PW_PORT: undefined }, '3100', resolvePlaywrightNetwork),
    /explicit/
  );
  assert.throws(() => configuration(env, '3000', resolvePlaywrightNetwork), /allocated/);
});
test('rejects remote or mismatched DB targets without disclosing credentials', () => {
  for (const [extra, expected] of [
    [{ DATABASE_URL: 'postgresql://private:secret@example.com/test' }, /loopback/],
    [{ E2E_DATABASE_URL: 'postgresql://private:secret@127.0.0.1:55433/test' }, /targets differ/],
    [{ DATABASE_URL_RLS: undefined }, /explicit/],
  ]) {
    assert.throws(
      () => configuration({ ...env, ...extra }, '3100', resolvePlaywrightNetwork),
      error => {
        assert.match(error.message, expected);
        return !error.message.includes('secret');
      }
    );
  }
});
test('rejects global billing overrides that previously invalidated full coverage', () => {
  assert.throws(
    () =>
      configuration(
        { ...env, NEXT_PUBLIC_BILLING_TEST_MODE: '1' },
        '3100',
        resolvePlaywrightNetwork
      ),
    /lane-owned/
  );
});
test('probes reachability and occupied ports; never claims SQL/RLS proof', async t => {
  const db = createServer(socket => socket.end());
  await new Promise(resolve => db.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    if (db.listening) db.close();
  });
  const app = createServer();
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const appPort = app.address().port;
  t.after(() => {
    if (app.listening) app.close();
  });
  const config = {
    appHost: '127.0.0.1',
    appPort,
    database: { host: '127.0.0.1', port: db.address().port },
  };
  await assert.rejects(probe(config), /occupied/);
  await new Promise(resolve => app.close(resolve));
  assert.equal((await probe(config)).sqlAndRlsVerified, false);
  await new Promise(resolve => db.close(resolve));
  await assert.rejects(probe(config), /DB TCP probe failed/);
});
