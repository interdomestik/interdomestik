#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '../..');
const SAFE_NAME = /^[a-z0-9-]+$/u;
const TEST_OUTCOMES = new Set(['skipped', 'expected', 'unexpected', 'flaky']);
const RESULT_OUTCOMES = new Set(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']);
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
  if (!Array.isArray(parsed?.suites) || parsed.suites.length === 0) fail('SUITES_INVALID');
  const configured = parsed?.config?.projects;
  if (Array.isArray(configured)) {
    const names = configured.map(project => project?.name);
    if (names.some(name => typeof name !== 'string') || new Set(names).size !== names.length) {
      fail('PROJECT_DUPLICATE');
    }
  }
  const projects = new Set();
  const specs = new Set();
  const specIds = new Set();
  const retryRecovered = new Set();
  const quarantined = new Set();
  let total = 0;
  let failed = Array.isArray(parsed.errors) && parsed.errors.length > 0;
  function visitSuite(suite) {
    if (!suite || typeof suite !== 'object' || !Array.isArray(suite.specs)) fail('SUITES_INVALID');
    for (const spec of suite.specs) {
      if (!spec || typeof spec !== 'object' || typeof spec.id !== 'string' || !spec.id) {
        fail('SPEC_INVALID');
      }
      if (specIds.has(spec.id)) fail('SPEC_DUPLICATE');
      specIds.add(spec.id);
      const specFile = safeSpec(spec.file);
      specs.add(specFile);
      if (!Array.isArray(spec.tests) || spec.tests.length === 0) fail('SPEC_INVALID');
      if (Array.isArray(spec.tags) && spec.tags.some(tag => typeof tag === 'string' && tag.replace(/^@/u, '') === 'quarantine')) quarantined.add(specFile);
      const specProjects = new Set();
      for (const currentTest of spec.tests) {
        const project = currentTest?.projectName;
        if (typeof project !== 'string' || !SAFE_NAME.test(project)) fail('PROJECT_INVALID');
        if (specProjects.has(project)) fail('PROJECT_DUPLICATE');
        specProjects.add(project);
        projects.add(project);
        if (!TEST_OUTCOMES.has(currentTest.status)) fail('OUTCOME_INVALID');
        if (!RESULT_OUTCOMES.has(currentTest.expectedStatus)) fail('OUTCOME_INVALID');
        if (!Array.isArray(currentTest.results)) fail('OUTCOME_INVALID');
        for (const result of currentTest.results) {
          if (!RESULT_OUTCOMES.has(result?.status)) fail('OUTCOME_INVALID');
        }
        if (currentTest.status === 'unexpected') failed = true;
        if (currentTest.results.length > 1 && currentTest.results.at(-1)?.status === 'passed') {
          retryRecovered.add(specFile);
        }
        total += 1;
      }
    }
    if (suite.suites !== undefined && !Array.isArray(suite.suites)) fail('SUITES_INVALID');
    for (const nested of suite.suites ?? []) visitSuite(nested);
  }
  for (const suite of parsed.suites) visitSuite(suite);
  if (total === 0) fail('REPORT_EMPTY');
  return {
    schemaVersion: 1,
    headSha: headSha.toLowerCase(),
    lane,
    status: failed ? 'fail' : 'pass',
    projects: [...projects].sort(),
    specs: [...specs].sort(),
    total,
    retryRecovered: [...retryRecovered].sort(),
    quarantined: [...quarantined].sort(),
    reportSha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
function parseArgs(args) {
  const expected = new Set(['report', 'head', 'lane', 'out']);
  const values = {};
  for (const arg of args) {
    const match = /^--([a-z]+)=(.+)$/u.exec(arg);
    if (!match || !expected.has(match[1])) fail('ARGUMENT_UNKNOWN');
    if (values[match[1]] !== undefined) fail('ARGUMENT_DUPLICATE');
    values[match[1]] = match[2];
  }
  for (const name of expected) if (values[name] === undefined) fail('ARGUMENT_MISSING');
  return values;
}
function resolveSafe(root, value, code) {
  const segments = value.split('/');
  if (
    path.isAbsolute(value) ||
    value.includes('\\') ||
    segments.some(segment => !segment || segment === '.' || segment === '..')
  ) {
    fail(code);
  }
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) fail(code);
  return resolved;
}
function isInside(root, target, allowRoot = false) {
  const relative = path.relative(root, target);
  return (allowRoot && relative === '') || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}
function assertOutputMissing(api, outputPath) {
  try {
    api.lstatSync(outputPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  fail('OUTPUT_EXISTS');
}

export function runCli(args, io = {}) {
  const api = { ...fs, ...io };
  const repoRoot = path.resolve(io.repoRoot ?? REPO_ROOT);
  const values = parseArgs(args);
  const reportPath = resolveSafe(repoRoot, values.report, 'REPORT_PATH_UNSAFE');
  const outputRoot = path.join(repoRoot, 'tmp/verification-evidence');
  const outputPath = resolveSafe(repoRoot, values.out, 'OUTPUT_PATH_UNSAFE');
  if (!isInside(outputRoot, outputPath)) fail('OUTPUT_PATH_UNSAFE');
  let report;
  try {
    report = api.readFileSync(reportPath);
  } catch {
    fail('REPORT_MISSING');
  }
  const realRepo = api.realpathSync(repoRoot);
  const realReport = api.realpathSync(reportPath);
  if (!isInside(realRepo, realReport)) fail('REPORT_PATH_OUTSIDE');
  api.mkdirSync(path.dirname(outputPath), { recursive: true });
  const realOutputRoot = api.realpathSync(outputRoot);
  const realOutputDir = api.realpathSync(path.dirname(outputPath));
  if (!isInside(realRepo, realOutputRoot) || !isInside(realOutputRoot, realOutputDir, true)) {
    fail('OUTPUT_PATH_OUTSIDE');
  }
  const summary = summarizePlaywrightReport({ report, headSha: values.head, lane: values.lane });
  assertOutputMissing(api, outputPath);
  try {
    api.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error?.code === 'EEXIST') fail('OUTPUT_EXISTS');
    throw error;
  }
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
