import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { runOwned } from './db-access-m4-platform-process.mjs';
import { writePrivate, readFixed, sha, fixedImageTool } from './db-access-m4-platform-custody.mjs';
import { startNext } from './db-access-m4-platform-next.mjs';

export async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
  return port;
}
export function validateFourCaseReporter(report) {
  const tests = [];
  const walk = suite => {
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests ?? []) tests.push({ ...test, title: spec.title });
    for (const nested of suite.suites ?? []) walk(nested);
  };
  for (const suite of report.suites ?? []) walk(suite);
  if (
    report.errors?.length ||
    tests.length !== 4 ||
    report.stats?.expected !== 4 ||
    report.stats?.unexpected !== 0 ||
    report.stats?.skipped !== 0 ||
    report.stats?.flaky !== 0 ||
    tests.some(
      test =>
        test.expectedStatus !== 'passed' ||
        test.status !== 'expected' ||
        test.results?.length !== 1 ||
        test.results[0].status !== 'passed' ||
        test.results[0].retry !== 0
    )
  )
    throw Error('Normal four-case Playwright execution required');
  const titles = [
    'actual compiled legacy-admin action and cache',
    'actual compiled legacy-agent action and cache',
    'actual compiled staff action and cache',
    'missing cookie denies without cache invalidation',
  ];
  if (JSON.stringify(tests.map(test => test.title)) !== JSON.stringify(titles))
    throw Error('Four exact browser programs required');
  return tests.map(test => ({ title: test.title, status: 'passed' }));
}
async function tlsBrowser(state, kind, port, index) {
  const file = writePrivate(
    state.layout['browser-inputs'],
    'tls-' + kind + '.json',
    JSON.stringify({
      kind,
      project: state.code,
      origin: 'https://127.0.0.1:' + port,
      profile: state.tls.profiles[index],
      executable: state.browser.executable,
      executableSha256: sha(readFixed(state.browser.executable)),
      home: state.browserHome,
      tmp: state.browserTmp,
    })
  );
  const execution = await runOwned(
    {
      argv: [
        process.execPath,
        '--disable-sigusr1',
        path.join(import.meta.dirname, 'db-access-m4-platform-browser-control.mjs'),
        file,
      ],
      cwd: state.code,
      env: state.cleanEnv,
    },
    state.deadlineAt
  );
  const result = JSON.parse(execution.stdout.trim());
  if (result.kind !== kind || result.posts !== 0 || result.closed !== true)
    throw Error('TLS execution mismatch');
  return result;
}
export async function runTLSControls(state, ownerPort) {
  const rows = [];
  let child;
  try {
    let port = await freePort();
    child = await startNext(state, 'good', port, ownerPort);
    rows.push(await tlsBrowser(state, 'good', port, 0));
    rows.push(await tlsBrowser(state, 'wrong-ca', port, 1));
    await child.stop();
    state.children.delete(child);
    child = undefined;
    for (const [kind, index] of [
      ['wrong-host', 2],
      ['expired', 3],
    ]) {
      port = await freePort();
      child = await startNext(state, kind, port, ownerPort);
      rows.push(await tlsBrowser(state, kind, port, index));
      await child.stop();
      state.children.delete(child);
      child = undefined;
    }
    let clientHellos = 0;
    const sockets = new Set();
    const plain = net.createServer(socket => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.setTimeout(2000, () => socket.destroy());
      socket.once('data', bytes => {
        if (bytes[0] === 0x16) clientHellos++;
        socket.end('HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: 8\r\n\r\nM4-PLAIN');
      });
    });
    await new Promise((resolve, reject) => {
      plain.once('error', reject);
      plain.listen(0, '127.0.0.1', resolve);
    });
    try {
      const plainPort = plain.address().port;
      const body = await new Promise((resolve, reject) => {
        const req = http.get(
          { host: '127.0.0.1', port: plainPort, path: '/', timeout: 2000 },
          res => {
            let value = '';
            res.on('data', bytes => {
              value += bytes;
              if (value.length > 32) req.destroy();
            });
            res.once('end', () =>
              res.statusCode === 200 ? resolve(value) : reject(Error('HTTP calibrator'))
            );
          }
        );
        req.once('error', reject);
        req.once('timeout', () => req.destroy(Error('HTTP calibration timeout')));
      });
      if (body !== 'M4-PLAIN') throw Error('Real plaintext calibration failed');
      rows.push(await tlsBrowser(state, 'plaintext', plainPort, 4));
      if (clientHellos < 1) throw Error('No actual TLS ClientHello at plaintext endpoint');
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve, reject) =>
        plain.close(error => (error ? reject(error) : resolve()))
      );
    }
  } finally {
    if (child) {
      await child.stop();
      state.children.delete(child);
    }
  }
  if (rows.length !== 5) throw Error('Five actual TLS controls required');
  return rows;
}
export async function executeFourBrowserCases(state) {
  const { assertFreshBrowserOutput } = await import(
    new URL('./m4-compiled-fixture/project/browser-output.mjs', import.meta.url)
  );
  assertFreshBrowserOutput(state.layout['browser-output']);
  const profiles = writePrivate(
    state.layout['browser-inputs'],
    'profiles.json',
    JSON.stringify({
      version: 1,
      firefoxRevision: '1543',
      profileRoot: state.layout['browser-profiles'],
      home: state.browserHome,
      tmp: state.browserTmp,
      profiles: state.tls.profiles.slice(5),
      executable: {
        path: state.browser.executable,
        sha256: sha(readFixed(state.browser.executable)),
      },
    })
  );
  const cli = fixedImageTool(state, 'playwright');
  const result = await runOwned(
    {
      argv: [
        process.execPath,
        '--disable-sigusr1',
        cli,
        'test',
        '--config',
        path.join(state.code, 'playwright.config.mjs'),
      ],
      cwd: state.code,
      env: {
        ...state.cleanEnv,
        M4_COMPILED_FIXTURE_ORIGIN: state.nextOrigin,
        M4_COMPILED_FIXTURE_PLAN_FILE: state.planFile,
        M4_COMPILED_BROWSER_OUTPUT: state.layout['browser-output'],
        M4_COMPILED_BROWSER_EXECUTABLE: state.browser.executable,
        M4_COMPILED_BROWSER_PROFILES_FILE: profiles,
        M4_COMPILED_BROWSER_COOKIE_FILE: state.cookieFile,
        M4_COMPILED_IMAGE_MANIFEST_SHA256: state.imagePin,
      },
    },
    state.deadlineAt
  );
  const reporterBytes = readFixed(
    path.join(state.layout['browser-output'], 'playwright-results.json'),
    2 * 1024 * 1024
  );
  const cases = validateFourCaseReporter(JSON.parse(reporterBytes));
  const browserBytes = readFixed(
    path.join(state.layout['browser-output'], 'observed-actions.json'),
    256 * 1024
  );
  const browser = JSON.parse(browserBytes);
  if (browser.complete !== true) throw Error('Complete actual browser observations required');
  return {
    browser,
    reporter: {
      sha256: sha(reporterBytes),
      cases,
      processPid: result.pid,
      drained: result.drained,
    },
    observationsSha256: sha(browserBytes),
  };
}
