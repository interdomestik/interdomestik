#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  computeAnchorMetadata,
  normalizePath,
  resolveFromRepoRoot,
  resolveRepoRoot,
  sha256,
  toRepoRelativePath,
} from './compute-anchor.mjs';

class CliUsageError extends Error {}

function printUsage() {
  console.error(
    'Usage: node scripts/release-gate/streak/capture-streak.mjs [--run-id <id>] [--date <YYYY-MM-DD>] [--manifest <path>] [--rc-root <dir>] [--out-root <dir>]'
  );
}

function parseArgs(argv) {
  const args = {
    runId: '',
    date: '',
    manifest: 'scripts/release-gate/v1-required-specs.json',
    rcRoot: path.join('tmp', 'release-rc'),
    outRoot: path.join('tmp', 'release-streak'),
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--run-id') {
      const runId = argv[index + 1];
      if (!runId || runId.startsWith('--')) {
        throw new CliUsageError('Missing value for --run-id');
      }
      args.runId = runId;
      index += 1;
      continue;
    }

    if (value === '--date') {
      const date = argv[index + 1];
      if (!date || date.startsWith('--')) {
        throw new CliUsageError('Missing value for --date');
      }
      args.date = date;
      index += 1;
      continue;
    }

    if (value === '--manifest') {
      const manifestPath = argv[index + 1];
      if (!manifestPath || manifestPath.startsWith('--')) {
        throw new CliUsageError('Missing value for --manifest');
      }
      args.manifest = manifestPath;
      index += 1;
      continue;
    }

    if (value === '--rc-root') {
      const rcRoot = argv[index + 1];
      if (!rcRoot || rcRoot.startsWith('--')) {
        throw new CliUsageError('Missing value for --rc-root');
      }
      args.rcRoot = rcRoot;
      index += 1;
      continue;
    }

    if (value === '--out-root') {
      const outRoot = argv[index + 1];
      if (!outRoot || outRoot.startsWith('--')) {
        throw new CliUsageError('Missing value for --out-root');
      }
      args.outRoot = outRoot;
      index += 1;
      continue;
    }

    if (value === '--help' || value === '-h') {
      printUsage();
      process.exit(0);
    }

    throw new CliUsageError(`Unknown argument: ${value}`);
  }

  if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new CliUsageError('--date must match YYYY-MM-DD');
  }

  if (args.runId && !/^[A-Za-z0-9._-]+$/.test(args.runId)) {
    throw new CliUsageError('--run-id must match [A-Za-z0-9._-]+');
  }

  return args;
}

function readHeadSha(repoRoot) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch (error) {
    throw new Error('Unable to read git HEAD SHA');
  }
}

function ensureFileExists(filePath, fieldName) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${fieldName} does not exist: ${filePath}`);
  }
}

function defaultRunId(headSha) {
  const iso = new Date().toISOString();
  const compactIso = iso.replace(/[:.]/g, '-');
  return `run-${compactIso}-${headSha.slice(0, 8)}`;
}

function getUtcDateSegment(inputDate) {
  if (inputDate) {
    return inputDate;
  }
  return new Date().toISOString().slice(0, 10);
}

function findLatestRcManifest(rcRootPath) {
  if (!fs.existsSync(rcRootPath) || !fs.statSync(rcRootPath).isDirectory()) {
    return null;
  }

  const candidates = [];
  for (const entry of fs.readdirSync(rcRootPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const rcManifestPath = path.join(rcRootPath, entry.name, 'rc.json');
    if (!fs.existsSync(rcManifestPath)) {
      continue;
    }

    const stat = fs.statSync(rcManifestPath);
    candidates.push({
      runId: entry.name,
      manifestPath: rcManifestPath,
      mtimeMs: stat.mtimeMs,
    });
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0] ?? null;
}

function copyFile(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function copyDirectory(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.cpSync(sourcePath, targetPath, {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
}

function collectFiles(rootDirPath, currentRelativePath = '') {
  const absolutePath = path.join(rootDirPath, currentRelativePath);
  const stat = fs.statSync(absolutePath);

  if (stat.isFile()) {
    return [normalizePath(currentRelativePath)];
  }

  if (!stat.isDirectory()) {
    return [];
  }

  const collected = [];
  const entries = fs.readdirSync(absolutePath, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const nextRelativePath = path.join(currentRelativePath, entry.name);
    if (entry.isDirectory()) {
      collected.push(...collectFiles(rootDirPath, nextRelativePath));
      continue;
    }
    if (entry.isFile()) {
      collected.push(normalizePath(nextRelativePath));
    }
  }

  return collected;
}

function writeChecksumFile(packDirPath) {
  const relativeFiles = collectFiles(packDirPath).filter(filePath => filePath !== 'pack.sha256');
  relativeFiles.sort((left, right) => left.localeCompare(right));

  const lines = relativeFiles.map(relativePath => {
    const absolutePath = path.join(packDirPath, relativePath);
    const fileHash = sha256(fs.readFileSync(absolutePath));
    return `${fileHash}  ${relativePath}`;
  });

  fs.writeFileSync(path.join(packDirPath, 'pack.sha256'), `${lines.join('\n')}\n`, 'utf8');
}

function parseRcManifest(rcManifestPath) {
  let content;
  try {
    content = fs.readFileSync(rcManifestPath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read rc.json: ${rcManifestPath}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`rc.json is not valid JSON: ${rcManifestPath}`);
  }

  return parsed;
}

function main() {
  const args = parseArgs(process.argv);
  const repoRoot = resolveRepoRoot();
  const manifestPath = resolveFromRepoRoot(repoRoot, args.manifest);
  const rcRootPath = resolveFromRepoRoot(repoRoot, args.rcRoot);
  const outRootPath = resolveFromRepoRoot(repoRoot, args.outRoot);
  ensureFileExists(manifestPath, '--manifest');
  toRepoRelativePath(repoRoot, manifestPath, '--manifest');
  toRepoRelativePath(repoRoot, rcRootPath, '--rc-root');
  toRepoRelativePath(repoRoot, outRootPath, '--out-root');

  const headSha = readHeadSha(repoRoot);
  const runId = args.runId || defaultRunId(headSha);
  const dateSegment = getUtcDateSegment(args.date);
  const runDirPath = path.join(outRootPath, dateSegment, runId);

  if (fs.existsSync(runDirPath)) {
    throw new Error(
      `Refusing overwrite of existing run directory: ${toRepoRelativePath(repoRoot, runDirPath, 'run directory')}`
    );
  }

  fs.mkdirSync(path.dirname(runDirPath), { recursive: true });
  fs.mkdirSync(runDirPath);

  const packMetadata = {
    generated_at_utc: new Date().toISOString(),
    run_id: runId,
    date_utc: dateSegment,
    head_sha: headSha,
    source_rc_run_id: null,
    included_paths: [],
    warnings: [],
  };

  const anchorMetadata = computeAnchorMetadata({ repoRoot, manifestPath });
  const anchorFilePath = path.join(runDirPath, 'anchor.json');
  fs.writeFileSync(anchorFilePath, `${JSON.stringify(anchorMetadata, null, 2)}\n`, 'utf8');
  packMetadata.included_paths.push(
    toRepoRelativePath(repoRoot, anchorFilePath, 'anchor metadata output')
  );

  const manifestCopyPath = path.join(runDirPath, 'manifest', path.basename(manifestPath));
  copyFile(manifestPath, manifestCopyPath);
  packMetadata.included_paths.push(
    toRepoRelativePath(repoRoot, manifestCopyPath, 'manifest copy output')
  );

  const latestRc = findLatestRcManifest(rcRootPath);
  if (!latestRc) {
    packMetadata.warnings.push('No rc.json found under rc root; pack includes anchor + manifest only');
  } else {
    packMetadata.source_rc_run_id = latestRc.runId;
    const rcManifestCopyPath = path.join(runDirPath, 'rc', 'rc.json');
    copyFile(latestRc.manifestPath, rcManifestCopyPath);
    packMetadata.included_paths.push(toRepoRelativePath(repoRoot, rcManifestCopyPath, 'rc manifest copy'));

    const rcShaPath = `${latestRc.manifestPath}.sha256`;
    if (fs.existsSync(rcShaPath)) {
      const rcShaCopyPath = path.join(runDirPath, 'rc', 'rc.json.sha256');
      copyFile(rcShaPath, rcShaCopyPath);
      packMetadata.included_paths.push(toRepoRelativePath(repoRoot, rcShaCopyPath, 'rc checksum copy'));
    }

    const rcData = parseRcManifest(latestRc.manifestPath);
    if (typeof rcData.manifest_path === 'string' && rcData.manifest_path.length > 0) {
      const rcManifestSourcePath = resolveFromRepoRoot(repoRoot, rcData.manifest_path);
      if (fs.existsSync(rcManifestSourcePath)) {
        const rcManifestSourceCopyPath = path.join(runDirPath, 'rc', 'manifest.from-rc.json');
        copyFile(rcManifestSourcePath, rcManifestSourceCopyPath);
        packMetadata.included_paths.push(
          toRepoRelativePath(repoRoot, rcManifestSourceCopyPath, 'rc referenced manifest copy')
        );
      } else {
        packMetadata.warnings.push(`Referenced manifest missing: ${rcData.manifest_path}`);
      }
    }

    if (typeof rcData.results_dir === 'string' && rcData.results_dir.length > 0) {
      const resultsDirPath = resolveFromRepoRoot(repoRoot, rcData.results_dir);
      if (fs.existsSync(resultsDirPath) && fs.statSync(resultsDirPath).isDirectory()) {
        const resultsCopyPath = path.join(runDirPath, 'results');
        copyDirectory(resultsDirPath, resultsCopyPath);
        packMetadata.included_paths.push(toRepoRelativePath(repoRoot, resultsCopyPath, 'results copy'));
      } else {
        packMetadata.warnings.push(`Referenced results directory missing: ${rcData.results_dir}`);
      }
    }

    if (typeof rcData.logs_dir === 'string' && rcData.logs_dir.length > 0) {
      const logsDirPath = resolveFromRepoRoot(repoRoot, rcData.logs_dir);
      if (fs.existsSync(logsDirPath) && fs.statSync(logsDirPath).isDirectory()) {
        const logsCopyPath = path.join(runDirPath, 'logs');
        copyDirectory(logsDirPath, logsCopyPath);
        packMetadata.included_paths.push(toRepoRelativePath(repoRoot, logsCopyPath, 'logs copy'));
      } else {
        packMetadata.warnings.push(`Referenced logs directory missing: ${rcData.logs_dir}`);
      }
    }
  }

  const packMetadataPath = path.join(runDirPath, 'pack.json');
  fs.writeFileSync(packMetadataPath, `${JSON.stringify(packMetadata, null, 2)}\n`, 'utf8');
  writeChecksumFile(runDirPath);

  process.stdout.write(
    `${JSON.stringify(
      {
        pack_dir: toRepoRelativePath(repoRoot, runDirPath, 'pack directory'),
        checksum_file: toRepoRelativePath(
          repoRoot,
          path.join(runDirPath, 'pack.sha256'),
          'checksum file'
        ),
        source_rc_run_id: packMetadata.source_rc_run_id,
      },
      null,
      2
    )}\n`
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (error instanceof CliUsageError) {
    printUsage();
  }
  process.exit(1);
}
