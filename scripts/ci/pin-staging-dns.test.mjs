import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STAGING_HOSTS,
  isPublicIpv4,
  pinStagingHost,
  renderHostsLine,
  runStagingDnsPin,
} from './pin-staging-dns.mjs';

const HOST = 'staging.interdomestik.com';
const IP = '76.76.21.21';
const unavailable = () => Promise.reject(new Error('private provider detail'));
const answer = addresses => ({
  Status: 0,
  Answer: addresses.map(data => ({ type: 1, data })),
});
const response = body => ({ ok: true, json: () => Promise.resolve(body) });
const runner = {
  GITHUB_ACTIONS: 'true',
  GITHUB_WORKFLOW: 'CD',
  GITHUB_JOB: 'deploy-staging',
  RUNNER_ENVIRONMENT: 'github-hosted',
  RUNNER_OS: 'Linux',
};

function harness(bodies = [answer([IP]), answer([IP])]) {
  const requests = [];
  const writes = [];
  const logs = [];
  const dependencies = {
    lookupImpl: unavailable,
    fetchImpl: (url, options) => {
      requests.push({ url: new URL(url), options });
      return Promise.resolve(response(bodies[requests.length - 1]));
    },
    writeImpl: line => writes.push(line),
    logImpl: line => logs.push(line),
  };
  return { dependencies, requests, writes, logs };
}

test('DoH disagreement or unavailability falls back to one system lookup without writing', async () => {
  await Promise.all(
    [false, true].map(async providerUnavailable => {
      const fixture = harness([answer([IP]), answer(['8.8.8.8'])]);
      if (providerUnavailable) fixture.dependencies.fetchImpl = unavailable;
      let calls = 0;
      fixture.dependencies.lookupImpl = (host, options) => {
        assert.equal(host, HOST);
        assert.deepEqual(options, { family: 4 });
        if (!providerUnavailable) assert.equal(fixture.requests.length, 2);
        calls += 1;
        return Promise.resolve({ address: IP, family: 4 });
      };
      assert.equal((await pinStagingHost(HOST, fixture.dependencies)).status, 'system');
      assert.equal(calls, 1);
      assert.deepEqual(fixture.writes, []);
    })
  );
});

test('DoH agreement pins even when the system resolver could answer right now', async () => {
  const fixture = harness([answer(['8.8.8.8', IP]), answer([IP, '1.1.1.1'])]);
  let lookups = 0;
  fixture.dependencies.lookupImpl = () => {
    lookups += 1;
    return Promise.resolve({ address: IP, family: 4 });
  };
  const result = await pinStagingHost(HOST, { ...fixture.dependencies, lookupTimeoutMs: 5 });
  assert.deepEqual(result, { status: 'pinned', address: IP });
  assert.equal(lookups, 0);
  assert.deepEqual(fixture.writes, [`${IP} ${HOST}\n`]);
  assert.deepEqual(
    fixture.requests.map(({ url }) => url.origin + url.pathname),
    ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve']
  );
  for (const { url, options } of fixture.requests) {
    assert.equal(url.searchParams.get('name'), HOST);
    assert.equal(url.searchParams.get('type'), 'A');
    assert.equal(options.headers.Accept, 'application/dns-json');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
  }
});

test('a timed-out system fallback is attempted once and fails without writing', async () => {
  const fixture = harness([answer([]), answer([])]);
  let calls = 0;
  fixture.dependencies.lookupImpl = () => {
    calls += 1;
    return new Promise(() => {});
  };
  const result = await pinStagingHost(HOST, { ...fixture.dependencies, lookupTimeoutMs: 5 });
  assert.equal(result.status, 'failed');
  assert.equal(calls, 1);
  assert.deepEqual(fixture.writes, []);
});

test('disagreement, empty, malformed, unsuccessful and non-A answers fail closed', async () => {
  const badBodies = [
    answer(['8.8.8.8']),
    answer([]),
    null,
    { Status: 2, Answer: answer([IP]).Answer },
    { Status: 0, TC: true, Answer: answer([IP]).Answer },
    { Status: 0, Answer: 'invalid' },
    { Status: 0, Answer: [{ type: 5, data: IP }, { type: 28, data: '::1' }, null] },
  ];
  await Promise.all(
    badBodies.map(async body => {
      const fixture = harness([answer([IP]), body]);
      assert.equal((await pinStagingHost(HOST, fixture.dependencies)).status, 'failed');
      assert.deepEqual(fixture.writes, []);
    })
  );
});

test('public IPv4 validation rejects special-use ranges and hosts-line injection', () => {
  const rejected = [
    '0.0.0.0',
    '0.1.2.3',
    '10.1.2.3',
    '100.64.0.1',
    '100.127.255.254',
    '127.1.2.3',
    '169.254.1.1',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.1',
    '192.0.0.1',
    '192.0.2.1',
    '192.88.99.1',
    '198.18.0.1',
    '198.19.255.254',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '239.255.255.254',
    '240.0.0.1',
    '255.255.255.255',
    '::1',
    '::ffff:76.76.21.21',
    '076.76.21.21',
    '256.1.1.1',
    '1.2.3',
    `${IP}\nother`,
  ];
  for (const address of rejected) assert.equal(isPublicIpv4(address), false, address);
  for (const address of [IP, '1.1.1.1', '100.63.255.254', '100.128.0.1', '172.32.0.1']) {
    assert.equal(isPublicIpv4(address), true, address);
  }
  assert.throws(() => renderHostsLine('127.0.0.1', HOST));
  assert.equal(renderHostsLine(IP, HOST), `${IP} ${HOST}\n`);
});

test('providers agreeing only on private IPv4 cannot write hosts', async () => {
  const fixture = harness([answer(['10.0.0.1', IP]), answer(['10.0.0.1', '8.8.8.8'])]);
  assert.equal((await pinStagingHost(HOST, fixture.dependencies)).status, 'failed');
  assert.deepEqual(fixture.writes, []);
});

test('fixed host allowlist rejects production, arbitrary suffixes and whitespace before IO', async () => {
  assert.deepEqual(STAGING_HOSTS, [HOST]);
  assert.equal(Object.isFrozen(STAGING_HOSTS), true);
  await Promise.all(
    [
      'interdomestik.com',
      'mk.interdomestik.com',
      'www.interdomestik.com',
      'staging.interdomestik.com.evil.test',
      `${HOST}\nother`,
      'other.vercel.app',
    ].map(async host => {
      const fixture = harness();
      await assert.rejects(pinStagingHost(host, fixture.dependencies), /allowlist/u);
      assert.throws(() => renderHostsLine(IP, host), /allowlist/u);
      assert.deepEqual(fixture.requests, []);
      assert.deepEqual(fixture.writes, []);
    })
  );
});

test('DNS and write failures block deploy/gate but only warn during rollback', async () => {
  const failures = [
    { fetchImpl: unavailable },
    { fetchImpl: () => Promise.resolve({ ok: false }) },
    { fetchImpl: () => Promise.resolve({ ok: true, json: unavailable }) },
    { fetchImpl: () => Promise.resolve(response(answer([]))) },
    { writeImpl: unavailable },
  ];
  const jobs = ['deploy-staging', 'e2e-staging', 'rollback-staging-alias'];
  await Promise.all(
    jobs.flatMap(job =>
      failures.map(async failure => {
        const fixture = harness();
        const env = { ...runner, GITHUB_JOB: job };
        const code = await runStagingDnsPin({ env, ...fixture.dependencies, ...failure });
        const rollback = job === 'rollback-staging-alias';
        assert.equal(code, rollback ? 0 : 1);
        assert.equal(fixture.logs.length, 1);
        const level = rollback ? 'warning' : 'error';
        assert.ok(fixture.logs[0].startsWith(`::${level}::staging-dns ${HOST} failed `));
        assert.doesNotMatch(fixture.logs[0], /private provider detail/u);
      })
    )
  );
});

test('runner logs exactly one status per host for system and pinned success', async () => {
  const system = harness([answer([]), answer([])]);
  system.dependencies.lookupImpl = () => Promise.resolve({ address: IP, family: 4 });
  const pinned = harness();
  const codes = await Promise.all(
    [system, pinned].map(fixture => runStagingDnsPin({ env: runner, ...fixture.dependencies }))
  );
  assert.deepEqual(codes, [0, 0]);
  assert.deepEqual(system.logs, [`staging-dns ${HOST} system`]);
  assert.deepEqual(pinned.logs, [`staging-dns ${HOST} pinned ${IP}`]);
});

test('CLI runner refuses local, self-hosted, production and PR contexts before IO', async () => {
  const contexts = [
    {},
    { ...runner, RUNNER_ENVIRONMENT: 'self-hosted' },
    { ...runner, RUNNER_OS: 'macOS' },
    { ...runner, GITHUB_WORKFLOW: 'CI' },
    { ...runner, GITHUB_JOB: 'deploy-production' },
  ];
  await Promise.all(
    contexts.map(async env => {
      const fixture = harness();
      assert.equal(await runStagingDnsPin({ env, ...fixture.dependencies }), 1);
      assert.deepEqual(fixture.requests, []);
      assert.deepEqual(fixture.writes, []);
      assert.match(fixture.logs[0], /^::error::/u);
    })
  );
});
