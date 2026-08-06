import fs from 'node:fs';
import path from 'node:path';
import { summarizePlaywrightReport } from './playwright-lane-evidence-policy.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

function fail(code) {
  throw new Error(code);
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
  return (
    (allowRoot && relative === '') ||
    (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  );
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
  const summary = summarizePlaywrightReport({
    report,
    headSha: values.head,
    lane: values.lane,
  });
  assertOutputMissing(api, outputPath);
  try {
    api.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    if (error?.code === 'EEXIST') fail('OUTPUT_EXISTS');
    throw error;
  }
  return summary;
}
