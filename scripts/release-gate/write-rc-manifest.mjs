#!/usr/bin/env node

import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

class CliUsageError extends Error {}

function printUsage() {
  console.error(
    'Usage: node scripts/release-gate/write-rc-manifest.mjs --manifest <path> --run-id <id> --results-dir <dir> --logs-dir <dir> [--out <file>]'
  );
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function parseArgs(argv) {
  const args = {
    manifest: '',
    runId: '',
    resultsDir: '',
    logsDir: '',
    out: '',
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--manifest') {
      const manifest = argv[index + 1];
      if (!manifest || manifest.startsWith('--')) {
        throw new CliUsageError('Missing value for --manifest');
      }
      args.manifest = manifest;
      index += 1;
      continue;
    }

    if (value === '--run-id') {
      const runId = argv[index + 1];
      if (!runId || runId.startsWith('--')) {
        throw new CliUsageError('Missing value for --run-id');
      }
      args.runId = runId;
      index += 1;
      continue;
    }

    if (value === '--results-dir') {
      const resultsDir = argv[index + 1];
      if (!resultsDir || resultsDir.startsWith('--')) {
        throw new CliUsageError('Missing value for --results-dir');
      }
      args.resultsDir = resultsDir;
      index += 1;
      continue;
    }

    if (value === '--logs-dir') {
      const logsDir = argv[index + 1];
      if (!logsDir || logsDir.startsWith('--')) {
        throw new CliUsageError('Missing value for --logs-dir');
      }
      args.logsDir = logsDir;
      index += 1;
      continue;
    }

    if (value === '--out') {
      const out = argv[index + 1];
      if (!out || out.startsWith('--')) {
        throw new CliUsageError('Missing value for --out');
      }
      args.out = out;
      index += 1;
      continue;
    }

    if (value === '--help' || value === '-h') {
      printUsage();
      process.exit(0);
    }

    throw new CliUsageError(`Unknown argument: ${value}`);
  }

  if (!args.manifest) {
    throw new CliUsageError('--manifest is required');
  }
  if (!args.runId) {
    throw new CliUsageError('--run-id is required');
  }
  if (!args.resultsDir) {
    throw new CliUsageError('--results-dir is required');
  }
  if (!args.logsDir) {
    throw new CliUsageError('--logs-dir is required');
  }

  return args;
}

function resolveRepoRoot() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(scriptDir, '../..');
}

function resolveFromRepoRoot(repoRoot, inputPath) {
  if (path.isAbsolute(inputPath)) {
    return path.normalize(inputPath);
  }
  return path.resolve(repoRoot, inputPath);
}

function toRepoRelativePath(repoRoot, absolutePath, fieldName) {
  const relativePath = path.relative(repoRoot, absolutePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`${fieldName} must be inside repository: ${absolutePath}`);
  }
  return normalizePath(relativePath || '.');
}

function readManifest(manifestPath) {
  let rawManifest;
  try {
    rawManifest = fs.readFileSync(manifestPath);
  } catch (error) {
    throw new Error(`Unable to read manifest: ${manifestPath}`);
  }

  let data;
  try {
    data = JSON.parse(rawManifest.toString('utf8'));
  } catch (error) {
    throw new Error(`Manifest is not valid JSON: ${manifestPath}`);
  }

  const commands = data?.required?.commands;
  if (!commands || typeof commands !== 'object' || Array.isArray(commands)) {
    throw new Error('Manifest missing required.commands object');
  }

  for (const [id, cmd] of Object.entries(commands)) {
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Manifest required.commands contains invalid command id');
    }
    if (typeof cmd !== 'string' || cmd.trim().length === 0) {
      throw new Error(`Manifest required.commands.${id} must be a non-empty string`);
    }
  }

  return { data, rawManifest };
}

function readExitCode(exitFilePath) {
  if (!fs.existsSync(exitFilePath)) {
    return null;
  }

  let content;
  try {
    content = fs.readFileSync(exitFilePath, 'utf8').trim();
  } catch (error) {
    return null;
  }

  if (!/^-?\d+$/.test(content)) {
    return null;
  }

  return Number.parseInt(content, 10);
}

function checkExitCodeZero(exitFilePath) {
  const code = readExitCode(exitFilePath);
  return code === 0;
}

function checkRlsIntegration(logsDirPath) {
  const rlsLogPath = path.join(logsDirPath, 'rls.log');
  if (!fs.existsSync(rlsLogPath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(rlsLogPath, 'utf8');
    return content.includes('RLS_INTEGRATION_RAN=1');
  } catch (error) {
    return false;
  }
}

function readGitSha(repoRoot) {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch (error) {
    throw new Error('Unable to read git SHA from repository');
  }
}

function buildCommandsObject(repoRoot, logsDirPath, manifestCommands) {
  const commands = {};

  for (const [id, cmd] of Object.entries(manifestCommands)) {
    const exitPath = path.join(logsDirPath, `${id}.exit`);
    const logPath = path.join(logsDirPath, `${id}.log`);

    const entry = {
      id,
      cmd,
      exit_code: readExitCode(exitPath),
    };

    if (fs.existsSync(logPath)) {
      entry.log_path = toRepoRelativePath(repoRoot, logPath, `Log for command ${id}`);
    }

    commands[id] = entry;
  }

  return commands;
}

function buildArtifacts(repoRoot, resultsDirPath) {
  const artifacts = {};
  const candidates = [
    ['junit_xml', 'junit.xml'],
    ['report_json', 'report.json'],
  ];

  for (const [key, fileName] of candidates) {
    const artifactPath = path.join(resultsDirPath, fileName);
    if (fs.existsSync(artifactPath)) {
      artifacts[key] = toRepoRelativePath(repoRoot, artifactPath, `Artifact ${fileName}`);
    }
  }

  return artifacts;
}

function main() {
  const args = parseArgs(process.argv);
  const repoRoot = resolveRepoRoot();

  const manifestPath = resolveFromRepoRoot(repoRoot, args.manifest);
  const resultsDirPath = resolveFromRepoRoot(repoRoot, args.resultsDir);
  const logsDirPath = resolveFromRepoRoot(repoRoot, args.logsDir);
  const outPath = resolveFromRepoRoot(
    repoRoot,
    args.out || path.join('tmp', 'release-rc', args.runId, 'rc.json')
  );

  const manifestRelativePath = toRepoRelativePath(repoRoot, manifestPath, '--manifest');
  const resultsDirRelativePath = toRepoRelativePath(repoRoot, resultsDirPath, '--results-dir');
  const logsDirRelativePath = toRepoRelativePath(repoRoot, logsDirPath, '--logs-dir');
  toRepoRelativePath(repoRoot, outPath, '--out');

  const { data: manifest, rawManifest } = readManifest(manifestPath);
  const commands = buildCommandsObject(repoRoot, logsDirPath, manifest.required.commands);
  const artifacts = buildArtifacts(repoRoot, resultsDirPath);

  const output = {
    git_sha: readGitSha(repoRoot),
    run_id: args.runId,
    timestamp_utc: new Date().toISOString(),
    manifest_path: manifestRelativePath,
    manifest_sha256: sha256(rawManifest),
    results_dir: resultsDirRelativePath,
    logs_dir: logsDirRelativePath,
    commands,
    checks: {
      no_skip_scan_passed: checkExitCodeZero(path.join(logsDirPath, 'no-skip.exit')),
      required_specs_verified: checkExitCodeZero(
        path.join(logsDirPath, 'verify-required-specs.exit')
      ),
      rls_integration_ran: checkRlsIntegration(logsDirPath),
    },
    artifacts,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  fs.writeFileSync(outPath, serialized, 'utf8');
  fs.writeFileSync(`${outPath}.sha256`, `${sha256(serialized)}\n`, 'utf8');

  const outRelativePath = toRepoRelativePath(repoRoot, outPath, '--out');
  console.log(`Wrote RC manifest: ${outRelativePath}`);
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
