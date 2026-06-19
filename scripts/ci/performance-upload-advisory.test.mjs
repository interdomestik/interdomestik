import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = path.join(repoRoot, 'scripts/performance-upload-advisory.mjs');

function run(args, env = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function runAsync(args, env = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => (stdout += chunk));
    child.stderr.on('data', chunk => (stderr += chunk));
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

async function withServer(handler, testBody) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await testBody(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('upload advisory runner reports blocked when prerequisites are missing', () => {
  const result = run([]);
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'blocked');
  assert.match(report.reasonCodes.join('\n'), /missing target URL/u);
  assert.match(report.reasonCodes.join('\n'), /missing fixture session env/u);
  assert.doesNotMatch(result.stdout + result.stderr, /session=/u);
});

test('upload advisory runner requires a safe tmp performance output path', () => {
  const result = run(['--out=docs/perf.json'], {
    ENT_PERF_UPLOAD_TARGET_URL: 'http://127.0.0.1:3000',
    ENT_PERF_UPLOAD_SESSION_COOKIE: 'session=secret',
    ENT_PERF_UPLOAD_TENANT_ID: 'tenant_fixture',
    ENT_PERF_UPLOAD_ACTOR_ID: 'user_fixture',
  });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /missing safe output path/u);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /secret|127\.0\.0\.1:3000|tenant_fixture|user_fixture/u
  );
});

test('upload advisory runner writes aggregate-only metrics', async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'ent-perf03-'));
  const outputPath = path.join('tmp/performance', path.basename(tempRoot), 'report.json');
  const absoluteOutputPath = path.join(repoRoot, outputPath);
  const requests = [];

  await withServer(
    (request, response) => {
      const chunks = [];
      request.on('data', chunk => chunks.push(chunk));
      request.on('end', () => {
        requests.push({
          method: request.method,
          url: request.url,
          contentType: request.headers['content-type'],
          body: Buffer.concat(chunks).toString('utf8'),
        });
        const validRequest =
          request.method === 'POST' &&
          request.url === '/api/uploads' &&
          request.headers['content-type'] === 'application/json';
        response.writeHead(validRequest ? 200 : 404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ signedUrl: 'https://storage.example/secret-token' }));
      });
    },
    async targetUrl => {
      const result = await runAsync(
        [
          `--target-url=${targetUrl}`,
          '--tenant-id=tenant_fixture',
          '--actor-id=user_fixture',
          '--samples=2',
          '--warmup=1',
          '--timeout-ms=1000',
          `--out=${outputPath}`,
        ],
        { ENT_PERF_UPLOAD_SESSION_COOKIE: 'session=secret' }
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(existsSync(absoluteOutputPath), true);
      const output = readFileSync(absoluteOutputPath, 'utf8');
      const report = JSON.parse(output);

      assert.equal(report.status, 'advisory_passed');
      assert.equal(report.surface, 'POST /api/uploads');
      assert.equal(report.samples, 2);
      assert.equal(report.metrics.errorCount, 0);
      assert.equal(typeof report.metrics.p95Ms, 'number');
      assert.equal(requests.length, 3);
      assert.ok(
        requests.every(
          request =>
            request.method === 'POST' &&
            request.url === '/api/uploads' &&
            request.contentType === 'application/json' &&
            JSON.parse(request.body).fileName === 'ent-perf03-synthetic.txt'
        )
      );
      assert.doesNotMatch(output + result.stdout + result.stderr, /secret-token|session=secret/u);
    }
  );

  rmSync(path.dirname(absoluteOutputPath), { recursive: true, force: true });
  rmSync(tempRoot, { recursive: true, force: true });
});
