import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_SCAN_ROOTS = ['apps/web/src'];
const APPROVED_MODULE = 'apps/web/src/lib/storage/service-role.ts';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

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
        'Usage: node scripts/check-service-role-storage-boundary.mjs [--root=<repo>] [--scan-root=<path,...>]'
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

function lineForIndex(source, index) {
  return source.slice(0, index).split('\n').length;
}

export function findServiceRoleStorageBoundaryViolations(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const scanRoots = options.scanRoots ?? DEFAULT_SCAN_ROOTS;
  const findings = [];

  for (const scanRoot of scanRoots) {
    const absoluteScanRoot = path.resolve(root, scanRoot);
    for (const filePath of walkSourceFiles(absoluteScanRoot)) {
      const relPath = toPosixRelative(root, filePath);
      if (relPath === APPROVED_MODULE || /\.(test|spec)\.[tj]sx?$/.test(relPath)) continue;

      const source = fs.readFileSync(filePath, 'utf8');
      if (!source.includes('.storage')) continue;

      const adminClientIndex = source.indexOf('createAdminClient');
      if (adminClientIndex !== -1) {
        findings.push({
          file: relPath,
          line: lineForIndex(source, adminClientIndex),
          reason: 'direct createAdminClient Storage access',
        });
      }

      const serviceKeyIndex = source.indexOf('SUPABASE_SERVICE_ROLE_KEY');
      if (serviceKeyIndex !== -1) {
        findings.push({
          file: relPath,
          line: lineForIndex(source, serviceKeyIndex),
          reason: 'direct SUPABASE_SERVICE_ROLE_KEY Storage access',
        });
      }
    }
  }

  return findings;
}

export function runServiceRoleStorageBoundaryGuard(options = {}) {
  const findings = findServiceRoleStorageBoundaryViolations(options);

  if (findings.length === 0) {
    console.log(
      'Service-role storage boundary guard passed: all admin Storage access is centralized.'
    );
    return 0;
  }

  console.error(
    'Service-role storage boundary guard failed: use apps/web/src/lib/storage/service-role.ts for Supabase admin Storage access.'
  );
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.reason}`);
  }
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runServiceRoleStorageBoundaryGuard(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
