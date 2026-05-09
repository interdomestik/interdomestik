import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_SCAN_ROOTS,
  parseScanArgs,
  toPosixRelative,
  walkSourceFiles,
} from './lib/source-scan.mjs';

const APPROVED_MODULE = 'apps/web/src/features/claims/upload/server/storage-path.ts';
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
    process.exitCode = runEvidenceStoragePathGuard(
      parseScanArgs(
        process.argv.slice(2),
        'Usage: node scripts/check-evidence-storage-paths.mjs [--root=<repo>] [--scan-root=<path,...>]'
      )
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
