#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const FAIL_RESULT_STATUSES = new Set(['failed', 'timedOut', 'interrupted']);
const PASS_RESULT_STATUSES = new Set(['passed']);

function readRequiredValue(argv, index, token) {
  const value = argv[index + 1];
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
    throw new Error(`Missing value for ${token}`);
  }
  return value;
}

function parseArgs(argv) {
  const parsed = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case '--reports-dir':
      case '--out-json':
      case '--out-md':
      case '--flaky-files-out':
      case '--repo-root':
      case '--rewrite-summary-out': {
        const value = readRequiredValue(argv, i, token);
        parsed[token.slice(2)] = value;
        i += 1;
        break;
      }
      case '--rewrite':
        parsed.rewrite = true;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!parsed['reports-dir']) {
    throw new Error('--reports-dir is required');
  }
  if (!parsed['out-json']) {
    throw new Error('--out-json is required');
  }
  if (!parsed['out-md']) {
    throw new Error('--out-md is required');
  }

  parsed.rewrite = Boolean(parsed.rewrite);
  parsed['repo-root'] = parsed['repo-root']
    ? path.resolve(parsed['repo-root'])
    : process.cwd();

  return parsed;
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function collectSpecsFromSuite(suite, output) {
  if (!suite || typeof suite !== 'object') return;

  if (Array.isArray(suite.specs)) {
    for (const spec of suite.specs) {
      output.push(spec);
    }
  }

  if (Array.isArray(suite.suites)) {
    for (const child of suite.suites) {
      collectSpecsFromSuite(child, output);
    }
  }
}

function isPathWithinDir(targetPath, baseDir) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedBase, resolvedTarget);

  if (relative === '') {
    return true;
  }
  if (relative === '..') {
    return false;
  }
  if (relative.startsWith(`..${path.sep}`)) {
    return false;
  }
  if (path.isAbsolute(relative)) {
    return false;
  }
  return true;
}

function buildUnknownSpecPath(repoRoot) {
  return path.resolve(repoRoot, 'apps/web/e2e/__unknown__.spec.ts');
}

function normalizeSpecFile(specFile, reportRootDir, repoRoot) {
  const safeFallback = buildUnknownSpecPath(repoRoot);
  if (typeof specFile !== 'string' || specFile.length === 0) {
    return safeFallback;
  }

  const candidate = path.isAbsolute(specFile)
    ? path.resolve(specFile)
    : path.resolve(reportRootDir, specFile);

  if (!isPathWithinDir(candidate, repoRoot)) {
    return safeFallback;
  }

  return candidate;
}

function isRewritePathAllowed(filePath, repoRoot) {
  const allowedRoot = path.resolve(repoRoot, 'apps/web/e2e');
  return isPathWithinDir(filePath, allowedRoot);
}

function deriveOutcome(testEntry) {
  const testStatus = typeof testEntry?.status === 'string' ? testEntry.status : null;
  const results = Array.isArray(testEntry?.results) ? testEntry.results : [];
  const resultStatuses = results
    .map(result => result?.status)
    .filter(status => typeof status === 'string');

  if (testStatus === 'flaky') {
    return 'fail';
  }
  if (testStatus === 'unexpected') {
    return 'fail';
  }
  if (resultStatuses.some(status => FAIL_RESULT_STATUSES.has(status))) {
    return 'fail';
  }
  if (resultStatuses.some(status => PASS_RESULT_STATUSES.has(status))) {
    return 'pass';
  }
  if (testStatus === 'expected' && testEntry?.expectedStatus === 'passed') {
    return 'pass';
  }
  return 'skipped';
}

function countPattern(filePath, regex) {
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath, 'utf8');
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

function insertImport(content, importLine) {
  const importBlocks = [...content.matchAll(/^(?:import[\s\S]*?;\n)/gm)];
  if (importBlocks.length === 0) {
    return `${importLine}${content}`;
  }

  const lastImport = importBlocks[importBlocks.length - 1];
  const insertAt = lastImport.index + lastImport[0].length;
  return `${content.slice(0, insertAt)}${importLine}${content.slice(insertAt)}`;
}

function rewriteFlakyFiles(flakyFiles, repoRoot) {
  const changedFiles = [];
  const skippedUnsafeFiles = [];
  let totalReplacements = 0;

  for (const filePath of flakyFiles) {
    if (!isRewritePathAllowed(filePath, repoRoot)) {
      skippedUnsafeFiles.push(filePath);
      continue;
    }

    if (!fs.existsSync(filePath)) continue;

    const original = fs.readFileSync(filePath, 'utf8');
    let updated = original;
    let fileReplacements = 0;

    updated = updated.replace(
      /await\s+([A-Za-z_$][\w.$]*)\.waitForTimeout\(\s*([0-9_]+)\s*\)\s*;?/g,
      (_, pageExpr, timeoutRaw) => {
        fileReplacements += 1;
        const timeout = String(timeoutRaw).replace(/_/g, '');
        return `await waitForAnyReadyMarker(${pageExpr}, { timeout: ${timeout} });`;
      }
    );

    if (fileReplacements === 0) {
      continue;
    }

    const hasWaitImport = /import\s*\{[^}]*\bwaitForAnyReadyMarker\b[^}]*\}\s*from\s*['"][^'"]+['"];?/m.test(
      updated
    );

    if (!hasWaitImport) {
      const helperAbsPath = path.resolve(repoRoot, 'apps/web/e2e/utils/deterministic-waits');
      let relImport = path.relative(path.dirname(filePath), helperAbsPath).replace(/\\/g, '/');
      if (!relImport.startsWith('.')) {
        relImport = `./${relImport}`;
      }
      const importLine = `import { waitForAnyReadyMarker } from '${relImport}';\n`;
      updated = insertImport(updated, importLine);
    }

    if (updated !== original) {
      fs.writeFileSync(filePath, updated, 'utf8');
      changedFiles.push({
        file: filePath,
        replacements: fileReplacements,
      });
      totalReplacements += fileReplacements;
    }
  }

  return {
    changedFiles,
    skippedUnsafeFiles,
    totalReplacements,
  };
}

function formatRunSummaryLine(run) {
  return `- \`${run.run}\`: unexpected=${run.unexpected}, flaky=${run.flaky}, errors=${run.errors}, status=${run.status}`;
}

function formatFlakyFileLine(fileEntry) {
  return `- \`${fileEntry.file}\`: flaky-tests=${fileEntry.flakyTestCount}, waitForTimeout=${fileEntry.waitForTimeoutCount}, getByText=${fileEntry.getByTextCount}`;
}

function formatFlakyTestLine(testEntry) {
  return `- [${testEntry.project}] \`${testEntry.file}\` :: ${testEntry.title} (pass runs: ${testEntry.passRuns.join(', ')}, fail runs: ${testEntry.failRuns.join(', ')})`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const reportsDir = path.resolve(args['reports-dir']);
  const repoRoot = args['repo-root'];

  if (!fs.existsSync(reportsDir)) {
    throw new Error(`Reports directory does not exist: ${reportsDir}`);
  }

  const reportFiles = fs
    .readdirSync(reportsDir)
    .filter(file => file.endsWith('.report.json'))
    .sort((a, b) => a.localeCompare(b));

  if (reportFiles.length === 0) {
    throw new Error(`No .report.json files found in: ${reportsDir}`);
  }

  const testObservations = new Map();
  const runSummaries = [];

  for (const reportFileName of reportFiles) {
    const reportPath = path.join(reportsDir, reportFileName);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const runLabel = reportFileName.replace(/\.report\.json$/, '');
    const reportRootDir =
      typeof report?.config?.rootDir === 'string'
        ? path.resolve(report.config.rootDir)
        : path.resolve(repoRoot, 'apps/web/e2e');

    const specs = [];
    for (const suite of Array.isArray(report?.suites) ? report.suites : []) {
      collectSpecsFromSuite(suite, specs);
    }
    const runErrorCount = Array.isArray(report?.errors) ? report.errors.length : 0;

    let observed = 0;
    let failures = 0;

    for (const spec of specs) {
      const fileAbs = normalizeSpecFile(spec?.file, reportRootDir, repoRoot);
      const fileRel = path.relative(repoRoot, fileAbs).replace(/\\/g, '/');
      const title = typeof spec?.title === 'string' && spec.title.length > 0 ? spec.title : '(unnamed)';

      for (const testEntry of Array.isArray(spec?.tests) ? spec.tests : []) {
        const project = testEntry?.projectName ?? testEntry?.projectId ?? 'unknown';
        const outcome = deriveOutcome(testEntry);
        if (outcome === 'skipped') continue;

        observed += 1;
        if (outcome === 'fail') failures += 1;

        const key = `${fileAbs}::${project}::${title}`;
        if (!testObservations.has(key)) {
          testObservations.set(key, {
            id: key,
            file: fileAbs,
            fileRel,
            project,
            title,
            passRuns: [],
            failRuns: [],
            observations: 0,
          });
        }

        const entry = testObservations.get(key);
        entry.observations += 1;
        if (outcome === 'fail') {
          entry.failRuns.push(runLabel);
        } else {
          entry.passRuns.push(runLabel);
        }
      }
    }

    runSummaries.push({
      run: runLabel,
      expected: report?.stats?.expected ?? 0,
      unexpected: report?.stats?.unexpected ?? 0,
      flaky: report?.stats?.flaky ?? 0,
      skipped: report?.stats?.skipped ?? 0,
      durationMs: report?.stats?.duration ?? 0,
      errors: runErrorCount,
      observedTests: observed,
      observedFailures: failures,
      status:
        failures > 0 || (report?.stats?.unexpected ?? 0) > 0 || runErrorCount > 0
          ? 'failed'
          : 'passed',
      reportPath,
    });
  }

  const allTests = [...testObservations.values()];
  const flakyTests = allTests
    .filter(test => test.passRuns.length > 0 && test.failRuns.length > 0)
    .sort((a, b) => b.failRuns.length - a.failRuns.length || a.fileRel.localeCompare(b.fileRel));
  const consistentFailingTests = allTests
    .filter(test => test.passRuns.length === 0 && test.failRuns.length > 0)
    .sort((a, b) => b.failRuns.length - a.failRuns.length || a.fileRel.localeCompare(b.fileRel));

  const flakyFilesMap = new Map();
  for (const test of flakyTests) {
    if (!flakyFilesMap.has(test.file)) {
      flakyFilesMap.set(test.file, {
        file: test.file,
        fileRel: test.fileRel,
        flakyTestCount: 0,
      });
    }
    flakyFilesMap.get(test.file).flakyTestCount += 1;
  }

  const flakyFiles = [...flakyFilesMap.values()]
    .map(entry => ({
      ...entry,
      waitForTimeoutCount: countPattern(entry.file, /\.waitForTimeout\s*\(/g),
      getByTextCount: countPattern(entry.file, /\.getByText\s*\(/g),
    }))
    .sort((a, b) => b.flakyTestCount - a.flakyTestCount || a.fileRel.localeCompare(b.fileRel));

  const rewriteResult = args.rewrite
    ? rewriteFlakyFiles(
        flakyFiles
          .map(entry => entry.file)
          .filter(file => fs.existsSync(file) && countPattern(file, /\.waitForTimeout\s*\(/g) > 0),
        repoRoot
      )
    : { changedFiles: [], skippedUnsafeFiles: [], totalReplacements: 0 };

  const payload = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    reportsDir,
    runsAnalyzed: runSummaries.length,
    runSummaries,
    totals: {
      observedTests: allTests.length,
      failedRuns: runSummaries.filter(run => run.status === 'failed').length,
      flakyTests: flakyTests.length,
      consistentFailingTests: consistentFailingTests.length,
      flakyFiles: flakyFiles.length,
    },
    flakyTests,
    flakyFiles,
    consistentFailingTests,
    rewrite: {
      enabled: args.rewrite,
      ...rewriteResult,
    },
  };

  const summaryMd = [
    '# Testing Agent Flake Audit',
    '',
    `- Generated: ${payload.generatedAt}`,
    `- Runs analyzed: ${payload.runsAnalyzed}`,
    `- Flaky tests: ${payload.totals.flakyTests}`,
    `- Flaky files: ${payload.totals.flakyFiles}`,
    `- Consistently failing tests: ${payload.totals.consistentFailingTests}`,
    '',
    '## Run Summary',
    ...runSummaries.map(formatRunSummaryLine),
    '',
    '## Flaky Files',
    ...(flakyFiles.length > 0 ? flakyFiles.map(formatFlakyFileLine) : ['- None']),
    '',
    '## Flaky Tests',
    ...(flakyTests.length > 0 ? flakyTests.slice(0, 50).map(formatFlakyTestLine) : ['- None']),
    '',
    '## Consistently Failing Tests',
    ...(consistentFailingTests.length > 0
      ? consistentFailingTests.slice(0, 50).map(formatFlakyTestLine)
      : ['- None']),
    '',
    '## Rewrite Summary',
    `- Enabled: ${args.rewrite ? 'yes' : 'no'}`,
    `- Changed files: ${rewriteResult.changedFiles.length}`,
    `- Skipped unsafe files: ${rewriteResult.skippedUnsafeFiles.length}`,
    `- Replacements: ${rewriteResult.totalReplacements}`,
    ...(rewriteResult.changedFiles.length > 0
      ? rewriteResult.changedFiles.map(
          file => `- \`${path.relative(repoRoot, file.file).replace(/\\/g, '/')}\`: ${file.replacements}`
        )
      : ['- No files changed']),
    '',
    '## Recommendations',
    '- Prioritize flaky files with `waitForTimeout` > 0 for deterministic marker waits.',
    '- Prefer `data-testid` selectors in assertions and interactions over translated text.',
    '- Keep `gotoApp(..., { marker })` explicit in all critical flows.',
    '',
  ].join('\n');

  ensureDir(args['out-json']);
  ensureDir(args['out-md']);
  fs.writeFileSync(args['out-json'], JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(args['out-md'], summaryMd, 'utf8');

  if (args['flaky-files-out']) {
    ensureDir(args['flaky-files-out']);
    fs.writeFileSync(
      args['flaky-files-out'],
      flakyFiles.map(entry => entry.file).join('\n'),
      'utf8'
    );
  }

  if (args['rewrite-summary-out']) {
    ensureDir(args['rewrite-summary-out']);
    fs.writeFileSync(args['rewrite-summary-out'], JSON.stringify(rewriteResult, null, 2), 'utf8');
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[testing-agent-analyze] FAIL: ${message}`);
  process.exit(1);
}
