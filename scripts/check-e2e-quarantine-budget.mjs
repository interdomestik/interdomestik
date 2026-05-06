#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_BASELINE_PATH = 'apps/web/e2e/quarantine/baseline.json';
const DEFAULT_REPORT_PATH = 'tmp/e2e-quarantine-budget/report.json';
const DEFAULT_SCAN_ROOT = 'apps/web/e2e';
const TAGS = ['quarantine', 'legacy'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function compareText(left, right) {
  return left.localeCompare(right);
}

function readOptionValue(arg, prefix) {
  const value = arg.slice(prefix.length).trim();
  if (!value) {
    throw new Error(`${prefix.slice(0, -1)} requires a non-empty value.`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    baselinePath: DEFAULT_BASELINE_PATH,
    reportPath: DEFAULT_REPORT_PATH,
    scanRoot: DEFAULT_SCAN_ROOT,
    writeBaseline: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--write-baseline') {
      options.writeBaseline = true;
      continue;
    }

    if (arg.startsWith('--baseline=')) {
      options.baselinePath = readOptionValue(arg, '--baseline=');
      continue;
    }

    if (arg.startsWith('--report=')) {
      options.reportPath = readOptionValue(arg, '--report=');
      continue;
    }

    if (arg.startsWith('--root=')) {
      options.scanRoot = readOptionValue(arg, '--root=');
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printUsage() {
  console.log(`Usage: node scripts/check-e2e-quarantine-budget.mjs [options]

Options:
  --baseline=<path>     Baseline file (default: ${DEFAULT_BASELINE_PATH})
  --report=<path>       JSON report file (default: ${DEFAULT_REPORT_PATH})
  --root=<path>         E2E scan root (default: ${DEFAULT_SCAN_ROOT})
  --write-baseline      Replace the baseline with the current marker inventory
  --help, -h            Show this message
`);
}

function toPosixRelative(filePath, repoRoot) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function walkSourceFiles(rootPath, repoRoot, files = []) {
  if (!fs.existsSync(rootPath)) return files;

  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    const fullPath = path.join(rootPath, entry.name);
    const relativePath = toPosixRelative(fullPath, repoRoot);

    if (/(^|\/)(node_modules|test-results|\.next|\.turbo)(\/|$)/u.test(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      walkSourceFiles(fullPath, repoRoot, files);
      continue;
    }

    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function collectMarkers(repoRoot, scanRoot) {
  const markers = {
    quarantine: [],
    legacy: [],
  };
  const tagPattern = /@(quarantine|legacy)\b/gu;
  const files = walkSourceFiles(path.resolve(repoRoot, scanRoot), repoRoot).sort(compareText);

  for (const filePath of files) {
    const file = toPosixRelative(filePath, repoRoot);
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/u);

    for (const [index, line] of lines.entries()) {
      tagPattern.lastIndex = 0;
      let match;
      while ((match = tagPattern.exec(line))) {
        const tag = match[1];
        markers[tag].push({
          file,
          line: index + 1,
          text: line.trim(),
        });
      }
    }
  }

  return markers;
}

function markerKey(marker) {
  return `${marker.file}:${marker.line}:${marker.text}`;
}

function validateMarker(marker, tag, index) {
  if (!marker || typeof marker !== 'object') {
    throw new Error(`Baseline @${tag} marker at index ${index} must be an object.`);
  }

  if (typeof marker.file !== 'string' || marker.file.length === 0) {
    throw new Error(`Baseline @${tag} marker at index ${index} must include a file.`);
  }

  if (!Number.isInteger(marker.line) || marker.line <= 0) {
    throw new Error(`Baseline @${tag} marker ${marker.file} must include a positive line number.`);
  }

  if (typeof marker.text !== 'string' || !marker.text.includes(`@${tag}`)) {
    throw new Error(
      `Baseline @${tag} marker ${marker.file}:${marker.line} must include marker text.`
    );
  }
}

function validateBaseline(baseline) {
  if (!baseline || typeof baseline !== 'object') {
    throw new Error('Baseline must be a JSON object.');
  }

  if (baseline.version !== 1) {
    throw new Error(`Unsupported E2E quarantine baseline version: ${baseline.version}`);
  }

  if (!baseline.tags || typeof baseline.tags !== 'object') {
    throw new Error('Baseline must include a tags object.');
  }

  for (const tag of TAGS) {
    const tagBaseline = baseline.tags[tag];
    if (!tagBaseline || typeof tagBaseline !== 'object') {
      throw new Error(`Baseline must include metadata for @${tag}.`);
    }

    if (!Array.isArray(tagBaseline.markers)) {
      throw new TypeError(`Baseline @${tag} metadata must include a markers array.`);
    }

    tagBaseline.markers.forEach((marker, index) => validateMarker(marker, tag, index));

    if (tagBaseline.count !== tagBaseline.markers.length) {
      throw new Error(
        `Baseline @${tag} count=${tagBaseline.count} does not match markers=${tagBaseline.markers.length}.`
      );
    }

    const markerFiles = [...new Set(tagBaseline.markers.map(marker => marker.file))].sort(
      compareText
    );
    const baselineFiles = Array.isArray(tagBaseline.files)
      ? [...tagBaseline.files].sort(compareText)
      : null;
    if (!baselineFiles || JSON.stringify(baselineFiles) !== JSON.stringify(markerFiles)) {
      throw new Error(`Baseline @${tag} files metadata does not match marker files.`);
    }
  }
}

function diffMarkers(current, baseline) {
  const added = {};
  const removed = {};

  for (const tag of TAGS) {
    const baselineEntries = baseline.tags?.[tag]?.markers ?? [];
    const currentEntries = current[tag] ?? [];
    const baselineKeys = new Set(baselineEntries.map(markerKey));
    const currentKeys = new Set(currentEntries.map(markerKey));

    added[tag] = currentEntries.filter(marker => !baselineKeys.has(markerKey(marker)));
    removed[tag] = baselineEntries.filter(marker => !currentKeys.has(markerKey(marker)));
  }

  return { added, removed };
}

function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return null;
  }
}

function findGitDir(startDir = process.cwd()) {
  let dir = path.resolve(startDir);

  while (true) {
    const gitPath = path.join(dir, '.git');
    if (fs.existsSync(gitPath)) {
      const stat = fs.statSync(gitPath);
      if (stat.isDirectory()) {
        return gitPath;
      }

      const gitFile = readTextFile(gitPath);
      const prefix = 'gitdir:';
      if (gitFile?.startsWith(prefix)) {
        const gitDir = gitFile.slice(prefix.length).trim();
        return path.resolve(dir, gitDir);
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function readGitHeadSha() {
  const gitDir = findGitDir();
  if (!gitDir) {
    return null;
  }

  const head = readTextFile(path.join(gitDir, 'HEAD'));
  if (!head) {
    return null;
  }

  if (/^[0-9a-f]{40}$/iu.test(head)) {
    return head;
  }

  const refPrefix = 'ref: ';
  if (!head.startsWith(refPrefix)) {
    return null;
  }

  const refName = head.slice(refPrefix.length).trim();
  const looseRef = readTextFile(path.join(gitDir, refName));
  if (looseRef) {
    return looseRef;
  }

  const packedRefs = readTextFile(path.join(gitDir, 'packed-refs'));
  const packedRefLine = packedRefs
    ?.split('\n')
    .find(line => line.endsWith(` ${refName}`) && /^[0-9a-f]{40} /iu.test(line));
  return packedRefLine?.slice(0, 40) ?? null;
}

function resolveBaselineSha(previous) {
  const ciSha = process.env.GITHUB_SHA?.trim();
  if (ciSha) {
    return ciSha;
  }

  return readGitHeadSha() || previous?.sha || null;
}

function buildBaseline(markers, previous = null) {
  const tags = {};

  for (const tag of TAGS) {
    const tagMarkers = markers[tag] ?? [];
    tags[tag] = {
      count: tagMarkers.length,
      files: [...new Set(tagMarkers.map(marker => marker.file))].sort(compareText),
      markers: tagMarkers,
    };
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    sha: resolveBaselineSha(previous),
    policy:
      'Freeze @quarantine and @legacy marker inventory. Any marker addition, removal, or relocation must update this baseline in the same reviewed PR.',
    tags,
  };
}

function readBaseline(baselinePath) {
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`Missing E2E quarantine baseline: ${baselinePath}`);
  }

  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  validateBaseline(baseline);
  return baseline;
}

function writeJson(filePath, payload) {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function markerSummary(markers) {
  return TAGS.map(tag => `${tag}=${markers[tag]?.length ?? 0}`).join(' ');
}

function formatMarkerList(markers) {
  return markers.map(marker => `${marker.file}:${marker.line} ${marker.text}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const baselinePath = path.resolve(repoRoot, options.baselinePath);
  const reportPath = path.resolve(repoRoot, options.reportPath);
  const markers = collectMarkers(repoRoot, options.scanRoot);

  if (options.writeBaseline) {
    const previous = fs.existsSync(baselinePath) ? readBaseline(baselinePath) : null;
    const nextBaseline = buildBaseline(markers, previous);
    writeJson(baselinePath, nextBaseline);
    console.log(`E2E quarantine baseline written: ${options.baselinePath}`);
    console.log(`E2E quarantine budget ${markerSummary(markers)}`);
    return;
  }

  const baseline = readBaseline(baselinePath);
  const diff = diffMarkers(markers, baseline);
  const report = {
    baselinePath: options.baselinePath,
    scanRoot: options.scanRoot,
    current: Object.fromEntries(TAGS.map(tag => [tag, markers[tag]?.length ?? 0])),
    baseline: Object.fromEntries(TAGS.map(tag => [tag, baseline.tags?.[tag]?.count ?? 0])),
    added: diff.added,
    removed: diff.removed,
  };

  writeJson(reportPath, report);

  const hasChanges = TAGS.some(tag => diff.added[tag].length > 0 || diff.removed[tag].length > 0);
  if (!hasChanges) {
    console.log(`E2E quarantine budget passed: ${markerSummary(markers)}`);
    console.log(`Report: ${options.reportPath}`);
    return;
  }

  console.error('E2E quarantine budget failed.');
  for (const tag of TAGS) {
    const added = formatMarkerList(diff.added[tag]);
    const removed = formatMarkerList(diff.removed[tag]);
    if (added.length > 0) {
      console.error(`Added @${tag} markers (${added.length}):`);
      for (const item of added) console.error(`- ${item}`);
    }
    if (removed.length > 0) {
      console.error(`Removed or moved @${tag} markers (${removed.length}):`);
      for (const item of removed) console.error(`- ${item}`);
    }
  }
  console.error(
    `Current totals: ${markerSummary(markers)}; baseline totals: ${TAGS.map(
      tag => `${tag}=${baseline.tags?.[tag]?.count ?? 0}`
    ).join(' ')}`
  );
  console.error(
    `Update ${options.baselinePath} only when the marker inventory change is intentional.`
  );
  process.exit(1);
}

main();
