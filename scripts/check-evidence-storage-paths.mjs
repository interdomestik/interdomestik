import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_SCAN_ROOTS = ['apps/web/src'];
const APPROVED_MODULE = 'apps/web/src/features/claims/upload/server/storage-path.ts';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const RAW_EVIDENCE_PATH_PATTERNS = [
  {
    kind: 'template literal',
    pattern: /`(?=[^`]*\$\{)[^`]*pii\/tenants\/[^`]*\/claims\/[^`]*`/gs,
  },
  {
    kind: 'string concatenation',
    pattern: /["']pii\/tenants\/["'][\s\S]{0,400}?\+[\s\S]{0,400}?["']\/claims\/["'][\s\S]{0,400}?\+/g,
  },
  {
    kind: 'split string concatenation',
    pattern:
      /["']pii\/?["']\s*\+\s*["']\/?tenants\/["'][\s\S]{0,400}?\+[\s\S]{0,400}?["']\/claims\/["'][\s\S]{0,400}?\+/g,
  },
  {
    kind: 'joined path segments',
    pattern:
      /\[\s*["']pii["']\s*,\s*["']tenants["'][\s\S]{0,400}?["']claims["'][\s\S]{0,400}?\.join\(\s*["']\/["']\s*\)/g,
  },
];

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    scanRoots: DEFAULT_SCAN_ROOTS,
  };

  for (const arg of argv) {
    if (arg.startsWith('--root=')) {
      options.root = path.resolve(arg.slice('--root='.length));
      continue;
    }
    if (arg.startsWith('--scan-root=')) {
      options.scanRoots = arg
        .slice('--scan-root='.length)
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node scripts/check-evidence-storage-paths.mjs [--root=<repo>] [--scan-root=<path,...>]'
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function toPosixRelative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function walkSourceFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'coverage') {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(fullPath, files);
      continue;
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

export function findRawEvidenceStoragePathTemplates(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const scanRoots = options.scanRoots ?? DEFAULT_SCAN_ROOTS;
  const findings = [];

  for (const scanRoot of scanRoots) {
    const absoluteScanRoot = path.resolve(root, scanRoot);
    for (const filePath of walkSourceFiles(absoluteScanRoot)) {
      const relPath = toPosixRelative(root, filePath);
      if (relPath === APPROVED_MODULE) continue;

      const source = fs.readFileSync(filePath, 'utf8');
      for (const { kind, pattern } of RAW_EVIDENCE_PATH_PATTERNS) {
        for (const match of source.matchAll(pattern)) {
          const line = source.slice(0, match.index).split('\n').length;
          findings.push({
            file: relPath,
            kind,
            line,
            snippet: match[0].replaceAll(/\s+/g, ' ').slice(0, 160),
          });
        }
      }
    }
  }

  return findings;
}

export function runEvidenceStoragePathGuard(options = {}) {
  const findings = findRawEvidenceStoragePathTemplates(options);

  if (findings.length === 0) {
    console.log('Evidence storage path guard passed: no raw claims evidence path templates found.');
    return 0;
  }

  console.error(
    'Evidence storage path guard failed: use buildEvidenceStoragePath/assertEvidenceStoragePath instead of raw claims evidence path templates.'
  );
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} [${finding.kind}] ${finding.snippet}`);
  }
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runEvidenceStoragePathGuard(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
