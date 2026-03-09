import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.resolve(scriptDir, '../..');

function parseArgs(argv) {
  const options = {
    minLinesPct: 60,
    rootDir: defaultRootDir,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--min-lines') {
      const next = argv[index + 1];
      if (!next) {
        throw new Error('--min-lines requires a numeric value.');
      }

      options.minLinesPct = Number(next);
      index += 1;
      continue;
    }

    if (arg === '--root') {
      const next = argv[index + 1];
      if (!next) {
        throw new Error('--root requires a path value.');
      }

      options.rootDir = path.resolve(next);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(options.minLinesPct)) {
    throw new Error(`Invalid --min-lines value: ${options.minLinesPct}`);
  }

  return options;
}

function findCoverageSummaryPaths(rootDir) {
  const summaryPaths = [path.join(rootDir, 'apps/web/coverage/coverage-summary.json')];
  const packagesDir = path.join(rootDir, 'packages');

  if (!fs.existsSync(packagesDir)) {
    return summaryPaths.filter(summaryPath => fs.existsSync(summaryPath));
  }

  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('domain-')) {
      continue;
    }

    summaryPaths.push(path.join(packagesDir, entry.name, 'coverage/coverage-summary.json'));
  }

  return summaryPaths.filter(summaryPath => fs.existsSync(summaryPath));
}

function getWorkspaceLabel(rootDir, summaryPath) {
  const workspaceDir = path.dirname(path.dirname(summaryPath));
  return path.relative(rootDir, workspaceDir);
}

function roundPct(value) {
  return Number(value.toFixed(2));
}

function readSummary(summaryPath) {
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const totalLines = summary?.total?.lines?.total;
  const coveredLines = summary?.total?.lines?.covered;

  if (!Number.isFinite(totalLines) || !Number.isFinite(coveredLines)) {
    throw new Error(`Coverage summary is missing total line data: ${summaryPath}`);
  }

  const pct = totalLines === 0 ? 100 : roundPct((coveredLines / totalLines) * 100);

  return {
    covered: coveredLines,
    pct,
    total: totalLines,
  };
}

export function runCoverageGate({ rootDir = defaultRootDir, minLinesPct = 60, stdout = true } = {}) {
  const summaryFiles = findCoverageSummaryPaths(rootDir);

  if (summaryFiles.length === 0) {
    throw new Error(`No coverage summaries found under ${rootDir}. Run pnpm test:coverage first.`);
  }

  const workspaces = summaryFiles
    .map(summaryPath => {
      const summary = readSummary(summaryPath);
      return {
        ...summary,
        label: getWorkspaceLabel(rootDir, summaryPath),
        summaryPath,
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));

  const aggregate = workspaces.reduce(
    (totals, workspace) => ({
      covered: totals.covered + workspace.covered,
      total: totals.total + workspace.total,
    }),
    { covered: 0, total: 0 }
  );

  const pct = aggregate.total === 0 ? 100 : roundPct((aggregate.covered / aggregate.total) * 100);
  const result = {
    aggregate: {
      ...aggregate,
      pct,
    },
    minLinesPct,
    ok: pct >= minLinesPct,
    summaryFiles,
    workspaces,
  };

  if (stdout) {
    console.log('Coverage gate workspace summary:');
    for (const workspace of workspaces) {
      console.log(
        `- ${workspace.label}: ${workspace.pct.toFixed(2)}% (${workspace.covered}/${workspace.total})`
      );
    }

    const verdict = result.ok ? 'PASS' : 'FAIL';
    console.log(
      `Coverage gate ${verdict}: repository lines ${pct.toFixed(2)}% (${aggregate.covered}/${aggregate.total}) vs required ${minLinesPct.toFixed(2)}%`
    );
  }

  return result;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = runCoverageGate(options);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Coverage gate error: ${message}`);
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === fileURLToPath(import.meta.url)) {
  main();
}
