#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const repoRoot = process.cwd();
const sessionEnvName = 'ENT_PERF_UPLOAD_SESSION_COOKIE';

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find(item => item.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : fallback;
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeOutputPath(input) {
  if (!input) return null;
  const resolved = path.resolve(repoRoot, input);
  const safeRoot = path.resolve(repoRoot, 'tmp/performance');
  return resolved.startsWith(`${safeRoot}${path.sep}`) ? resolved : null;
}

function percentile(values, pct) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function writeReport(report, outputPath) {
  const body = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) {
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, body);
  }
  console.log(body.trimEnd());
}

function blocked(reasons, outputPath) {
  writeReport({ status: 'blocked', surface: 'POST /api/uploads', reasons }, outputPath);
  process.exitCode = 2;
}

function validateConfig(config) {
  const missing = [];
  if (!config.targetUrl) missing.push('missing target URL');
  if (!config.sessionCookie) missing.push(`missing fixture session env ${sessionEnvName}`);
  if (!config.tenantId) missing.push('missing fixture tenant id');
  if (!config.actorId) missing.push('missing fixture actor id');
  if (!config.outputPath) missing.push('missing safe output path under tmp/performance');
  if (missing.length > 0) return missing;

  let parsedUrl;
  try {
    parsedUrl = new URL(config.targetUrl);
  } catch {
    return ['target URL is invalid'];
  }
  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname === 'interdomestik.com' || hostname === 'www.interdomestik.com') {
    return ['production target URL is not allowed'];
  }
  return [];
}

async function timedUploadAttempt(config) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(new URL('/api/uploads', config.targetUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: config.sessionCookie },
      body: JSON.stringify({
        fileName: 'ent-perf03-synthetic.txt',
        fileType: 'text/plain',
        fileSize: 128,
      }),
      signal: controller.signal,
    });
    const ok = response.ok;
    await response.body?.cancel().catch(() => {});
    return { durationMs: Math.round(performance.now() - started), ok, timeout: false };
  } catch (error) {
    return {
      durationMs: Math.round(performance.now() - started),
      ok: false,
      timeout: error?.name === 'AbortError',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const outputPath = safeOutputPath(arg('out', process.env.ENT_PERF_UPLOAD_OUTPUT_PATH));
  const config = {
    targetUrl: arg('target-url', process.env.ENT_PERF_UPLOAD_TARGET_URL),
    sessionCookie: process.env[sessionEnvName],
    tenantId: arg('tenant-id', process.env.ENT_PERF_UPLOAD_TENANT_ID),
    actorId: arg('actor-id', process.env.ENT_PERF_UPLOAD_ACTOR_ID),
    samples: toPositiveInt(arg('samples', process.env.ENT_PERF_UPLOAD_SAMPLES), 5),
    warmup: toPositiveInt(arg('warmup', process.env.ENT_PERF_UPLOAD_WARMUP), 1),
    timeoutMs: toPositiveInt(arg('timeout-ms', process.env.ENT_PERF_UPLOAD_TIMEOUT_MS), 5000),
    outputPath,
  };

  const blockers = validateConfig(config);
  if (blockers.length > 0) return blocked(blockers, outputPath);

  for (let i = 0; i < config.warmup; i += 1) await timedUploadAttempt(config);
  const attempts = [];
  for (let i = 0; i < config.samples; i += 1) attempts.push(await timedUploadAttempt(config));

  const durations = attempts.map(attempt => attempt.durationMs);
  writeReport(
    {
      status: attempts.some(attempt => !attempt.ok) ? 'advisory_failed' : 'advisory_passed',
      surface: 'POST /api/uploads',
      generatedAt: new Date().toISOString(),
      targetKind: new URL(config.targetUrl).hostname,
      fixture: { tenantId: config.tenantId, actorId: config.actorId },
      samples: attempts.length,
      warmup: config.warmup,
      concurrency: 1,
      timeoutMs: config.timeoutMs,
      metrics: {
        minMs: Math.min(...durations),
        maxMs: Math.max(...durations),
        p50Ms: percentile(durations, 50),
        p95Ms: percentile(durations, 95),
        p99Ms: percentile(durations, 99),
        errorCount: attempts.filter(attempt => !attempt.ok).length,
        timeoutCount: attempts.filter(attempt => attempt.timeout).length,
      },
    },
    config.outputPath
  );
}

await main();
