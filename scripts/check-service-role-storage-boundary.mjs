import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_SCAN_ROOTS,
  lineForIndex,
  parseScanArgs,
  toPosixRelative,
  walkSourceFiles,
} from './lib/source-scan.mjs';

const APPROVED_MODULE = 'apps/web/src/lib/storage/service-role.ts';

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
    process.exitCode = runServiceRoleStorageBoundaryGuard(
      parseScanArgs(
        process.argv.slice(2),
        'Usage: node scripts/check-service-role-storage-boundary.mjs [--root=<repo>] [--scan-root=<path,...>]'
      )
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
