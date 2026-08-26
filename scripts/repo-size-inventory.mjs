import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { budgetCategory } from './repo-size-budget-sync-core.mjs';

const SOURCE_EXTENSIONS = new Set(['.cjs', '.css', '.js', '.mjs', '.sh', '.ts', '.tsx']);
const LOCAL_DISK_TARGETS = [
  '.git',
  'node_modules',
  'apps/web/.next',
  'apps/web/node_modules',
  'apps/web/playwright-report',
  'apps/web/test-results',
  'packages/database/drizzle',
  'apps/web/e2e/snapshots',
];

const compareBytes = (left, right) =>
  right.bytes - left.bytes || left.path.localeCompare(right.path);
const compareLines = (left, right) =>
  right.lines - left.lines || left.path.localeCompare(right.path);
const compareNamed = (left, right) =>
  right.bytes - left.bytes || left.name.localeCompare(right.name);

export function getTrackedFiles(repoRoot, options, { gitBin, env }) {
  const args = ['ls-files', '-z', '--cached'];
  if (options.includeUntracked) args.push('--others', '--exclude-standard');
  const output = execFileSync(gitBin, args, {
    cwd: repoRoot,
    encoding: 'buffer',
    env,
  }); // NOSONAR - caller supplies the fixed absolute Git executable and system PATH.
  return [...new Set(output.toString('utf8').split('\0').filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function topLevelBucket(filePath) {
  const parts = filePath.split('/');
  return (parts[0] === 'apps' || parts[0] === 'packages') && parts[1]
    ? `${parts[0]}/${parts[1]}`
    : parts[0];
}

function lineCount(absolutePath) {
  const text = fs.readFileSync(absolutePath, 'utf8');
  if (!text) return 0;
  const newlines = text.match(/\n/gu)?.length ?? 0;
  return text.endsWith('\n') ? newlines : newlines + 1;
}

function addStat(bucket, key, bytes) {
  const value = bucket.get(key) ?? { name: key, files: 0, bytes: 0 };
  value.files++;
  value.bytes += bytes;
  bucket.set(key, value);
}

export function collectTrackedStats(repoRoot, trackedFiles, options) {
  const categories = new Map();
  const directories = new Map();
  const largestFiles = [];
  const sourceHotspots = [];
  const missingFiles = [];
  let totalBytes = 0;
  let processedFiles = 0;
  for (const relPath of trackedFiles) {
    const absolutePath = path.join(repoRoot, relPath);
    if (!fs.existsSync(absolutePath)) {
      missingFiles.push(relPath);
      continue;
    }
    const bytes = fs.statSync(absolutePath).size;
    processedFiles++;
    totalBytes += bytes;
    addStat(categories, budgetCategory(relPath), bytes);
    addStat(directories, topLevelBucket(relPath), bytes);
    largestFiles.push({ path: relPath, bytes });
    const extension = path.extname(relPath);
    if (SOURCE_EXTENSIONS.has(extension) && !relPath.endsWith('.d.ts')) {
      const lines = lineCount(absolutePath);
      if (lines >= options.minLines) sourceHotspots.push({ path: relPath, lines, bytes });
    }
  }
  return {
    total: { files: processedFiles, bytes: totalBytes, missingFiles: missingFiles.length },
    missingFiles,
    categories: [...categories.values()].sort(compareNamed),
    directories: [...directories.values()].sort(compareNamed),
    largestFiles: largestFiles.sort(compareBytes).slice(0, options.top),
    sourceHotspots: sourceHotspots.sort(compareLines).slice(0, options.top),
  };
}

export function collectLocalDiskStats(repoRoot, { duBin, env }) {
  const targets = [];
  for (const target of LOCAL_DISK_TARGETS) {
    const absolutePath = path.join(repoRoot, target);
    if (!fs.existsSync(absolutePath)) continue;
    const output = execFileSync(duBin, ['-sk', target], {
      cwd: repoRoot,
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim(); // NOSONAR - caller supplies the fixed absolute du executable and system PATH.
    targets.push({ path: target, bytes: Number(output.split(/\s+/u)[0]) * 1024 });
  }
  return targets.sort(compareBytes);
}
