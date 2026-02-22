#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

class CliUsageError extends Error {}

function printUsage() {
  console.error(
    'Usage: node scripts/release-gate/streak/compute-anchor.mjs [--manifest <path>] [--out <path>]'
  );
}

export function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

export function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function resolveRepoRoot() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(scriptDir, '../../..');
}

export function resolveFromRepoRoot(repoRoot, inputPath) {
  if (path.isAbsolute(inputPath)) {
    return path.normalize(inputPath);
  }
  return path.resolve(repoRoot, inputPath);
}

export function toRepoRelativePath(repoRoot, absolutePath, fieldName) {
  const relativePath = path.relative(repoRoot, absolutePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`${fieldName} must be inside repository: ${absolutePath}`);
  }
  return normalizePath(relativePath || '.');
}

function parseArgs(argv) {
  const args = {
    manifest: 'scripts/release-gate/v1-required-specs.json',
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

    if (value === '--out') {
      const outPath = argv[index + 1];
      if (!outPath || outPath.startsWith('--')) {
        throw new CliUsageError('Missing value for --out');
      }
      args.out = outPath;
      index += 1;
      continue;
    }

    if (value === '--help' || value === '-h') {
      printUsage();
      process.exit(0);
    }

    throw new CliUsageError(`Unknown argument: ${value}`);
  }

  return args;
}

function readManifestNoTouchZones(manifestPath) {
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read manifest: ${manifestPath}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Manifest is not valid JSON: ${manifestPath}`);
  }

  const noTouchZones = data?.no_touch_zones;
  if (!Array.isArray(noTouchZones) || noTouchZones.length === 0) {
    throw new Error('Manifest missing non-empty no_touch_zones array');
  }

  for (const zone of noTouchZones) {
    if (typeof zone !== 'string' || zone.trim().length === 0) {
      throw new Error('Manifest no_touch_zones must contain non-empty string paths');
    }
    if (path.isAbsolute(zone)) {
      throw new Error(`no_touch_zones entries must be repo-relative paths: ${zone}`);
    }
  }

  return noTouchZones;
}

function readGitSha(repoRoot, args) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch (error) {
    throw new Error(`Unable to run git ${args.join(' ')} from repository root`);
  }
}

function toGitPathspec(noTouchZone) {
  const normalizedZone = normalizePath(noTouchZone);
  const hasGlob = /[*?[\]{}]/.test(normalizedZone);
  return hasGlob ? `:(glob)${normalizedZone}` : normalizedZone;
}

function findAnchorSha(repoRoot, noTouchZones) {
  const pathspecs = [...new Set(noTouchZones.map(toGitPathspec))];
  const anchorSha = readGitSha(repoRoot, ['log', '-n', '1', '--format=%H', '--', ...pathspecs]);
  if (!anchorSha) {
    throw new Error('Unable to compute anchor SHA: no commit found for no_touch_zones');
  }
  return anchorSha;
}

export function computeAnchorMetadata({ repoRoot, manifestPath }) {
  const noTouchZones = readManifestNoTouchZones(manifestPath);
  const headSha = readGitSha(repoRoot, ['rev-parse', 'HEAD']);
  const anchorSha = findAnchorSha(repoRoot, noTouchZones);

  return {
    generated_at_utc: new Date().toISOString(),
    head_sha: headSha,
    anchor_sha: anchorSha,
    no_touch_zones: noTouchZones,
  };
}

function maybeWriteAnchorFile(repoRoot, outPath, anchorMetadata) {
  if (!outPath) {
    return;
  }

  const absoluteOutPath = resolveFromRepoRoot(repoRoot, outPath);
  toRepoRelativePath(repoRoot, absoluteOutPath, '--out');
  fs.mkdirSync(path.dirname(absoluteOutPath), { recursive: true });

  const serialized = `${JSON.stringify(anchorMetadata, null, 2)}\n`;
  fs.writeFileSync(absoluteOutPath, serialized, 'utf8');
  fs.writeFileSync(`${absoluteOutPath}.sha256`, `${sha256(serialized)}\n`, 'utf8');
}

function isDirectExecution() {
  if (!process.argv[1]) {
    return false;
  }
  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

function main() {
  const args = parseArgs(process.argv);
  const repoRoot = resolveRepoRoot();
  const manifestPath = resolveFromRepoRoot(repoRoot, args.manifest);
  toRepoRelativePath(repoRoot, manifestPath, '--manifest');

  const anchorMetadata = computeAnchorMetadata({ repoRoot, manifestPath });
  maybeWriteAnchorFile(repoRoot, args.out, anchorMetadata);
  process.stdout.write(`${JSON.stringify(anchorMetadata, null, 2)}\n`);
}

if (isDirectExecution()) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof CliUsageError) {
      printUsage();
    }
    process.exit(1);
  }
}
