import { createHash } from 'node:crypto';
import path from 'node:path';
import { collectReportEvidence } from './playwright-lane-evidence-collector.mjs';

const SAFE_NAME = /^[a-z0-9-]+$/u;

function fail(code) {
  throw new Error(code);
}

export function playwrightReportArgs(evidenceLane) {
  const args = ['--trace=retain-on-failure'];
  if (typeof evidenceLane !== 'string' || !SAFE_NAME.test(evidenceLane)) {
    args.push('--reporter=line');
  }
  return args;
}

function rawReport(report) {
  if (Buffer.isBuffer(report)) return report;
  if (report instanceof Uint8Array) return Buffer.from(report);
  if (typeof report === 'string') return Buffer.from(report);
  if (report && typeof report === 'object') return Buffer.from(JSON.stringify(report));
  return fail('REPORT_INVALID');
}

function safeSpec(file) {
  if (typeof file !== 'string' || !file || file.includes('\\') || path.posix.isAbsolute(file)) {
    return fail('SPEC_PATH_INVALID');
  }
  const segments = file.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    return fail('SPEC_PATH_INVALID');
  }
  const normalized = file.startsWith('e2e/') ? file : `e2e/${file}`;
  if (!/\.spec\.[cm]?[jt]sx?$/u.test(normalized)) return fail('SPEC_PATH_INVALID');
  return normalized;
}

export function summarizePlaywrightReport({ report, headSha, lane }) {
  if (typeof headSha !== 'string' || !/^[0-9a-f]{40}$/iu.test(headSha)) {
    fail('HEAD_SHA_INVALID');
  }
  if (typeof lane !== 'string' || !SAFE_NAME.test(lane)) fail('LANE_INVALID');
  const bytes = rawReport(report);
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('REPORT_JSON_INVALID');
  }
  const evidence = collectReportEvidence(parsed, { safeName: SAFE_NAME, safeSpec });
  const compareText = (left, right) => left.localeCompare(right);
  return {
    schemaVersion: 1,
    headSha: headSha.toLowerCase(),
    lane,
    status: evidence.failed ? 'fail' : 'pass',
    projects: [...evidence.projects].sort(compareText),
    specs: [...evidence.specs].sort(compareText),
    total: evidence.total,
    retryRecovered: [...evidence.retryRecovered].sort(compareText),
    quarantined: [...evidence.quarantined].sort(compareText),
    reportSha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
