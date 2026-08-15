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
  const supported = {
    '--min-lines': ['minLinesPct', Number],
    '--root': ['rootDir', path.resolve],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [key, transform] = supported[arg] ?? [];
    if (!key) throw new Error(`Unknown argument: ${arg}`);
    const next = argv[++index];
    if (!next) throw new Error(`${arg} requires a value.`);
    options[key] = transform(next);
  }

  if (!Number.isFinite(options.minLinesPct)) {
    throw new Error(`Invalid --min-lines value: ${options.minLinesPct}`);
  }

  return options;
}

function findCoverageSummaryPaths(rootDir) {
  const requiredSummaries = [
    path.join(rootDir, 'apps/web/coverage/coverage-summary.json'),
    path.join(rootDir, 'packages/shared-auth/coverage/coverage-summary.json'),
  ];
  for (const summaryPath of requiredSummaries) {
    if (!fs.existsSync(summaryPath)) {
      throw new Error(`Required coverage summary is missing: ${summaryPath}`);
    }
  }
  const summaryPaths = [...requiredSummaries];
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

function readSummary(summaryPath) {
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const totalLines = summary?.total?.lines?.total;
  const coveredLines = summary?.total?.lines?.covered;

  if (!Number.isFinite(totalLines) || !Number.isFinite(coveredLines)) {
    throw new Error(`Coverage summary is missing total line data: ${summaryPath}`);
  }
  if (summaryPath.includes(`${path.sep}packages${path.sep}shared-auth${path.sep}`) && totalLines === 0) {
    throw new Error(`Required shared-auth coverage summary has zero total lines: ${summaryPath}`);
  }
  const pct = totalLines === 0 ? 100 : Number(((coveredLines / totalLines) * 100).toFixed(2));

  return {
    covered: coveredLines,
    pct,
    total: totalLines,
  };
}

export function runCoverageGate({
  rootDir = defaultRootDir,
  minLinesPct = 60,
  stdout = true,
} = {}) {
  const summaryFiles = findCoverageSummaryPaths(rootDir);
  const workspaces = summaryFiles
    .map(summaryPath => {
      const summary = readSummary(summaryPath);
      return {
        ...summary,
        label: path.relative(rootDir, path.dirname(path.dirname(summaryPath))),
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

  const pct =
    aggregate.total === 0 ? 100 : Number(((aggregate.covered / aggregate.total) * 100).toFixed(2));
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
