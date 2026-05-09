import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NEXT_CONFIG_PATH = 'apps/web/next.config.mjs';

function lineForIndex(source, index) {
  return source.slice(0, index).split('\n').length;
}

export function findNextTypeScriptBuildIntegrityViolations(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const configPath = path.join(root, NEXT_CONFIG_PATH);

  if (!fs.existsSync(configPath)) {
    return [
      {
        file: NEXT_CONFIG_PATH,
        line: 1,
        reason: 'Next.js config is missing, so TypeScript build enforcement cannot be verified',
      },
    ];
  }

  const source = fs.readFileSync(configPath, 'utf8');
  const findings = [];

  for (const match of source.matchAll(/\bignoreBuildErrors\s*:/g)) {
    findings.push({
      file: NEXT_CONFIG_PATH,
      line: lineForIndex(source, match.index ?? 0),
      reason:
        'Next.js builds must fail on TypeScript errors; do not set typescript.ignoreBuildErrors',
    });
  }

  return findings;
}

export function runNextTypeScriptBuildIntegrityGuard(options = {}) {
  const findings = findNextTypeScriptBuildIntegrityViolations(options);

  if (findings.length === 0) {
    console.log('Next TypeScript build integrity guard passed: ignoreBuildErrors is not set.');
    return 0;
  }

  console.error(
    'Next TypeScript build integrity guard failed: production builds may skip type errors.'
  );
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.reason}`);
  }
  return 1;
}

function parseArgs(args) {
  const options = {};

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/check-next-typescript-build-integrity.mjs [--root=<repo>]');
      process.exit(0);
    }

    if (arg.startsWith('--root=')) {
      options.root = arg.slice('--root='.length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runNextTypeScriptBuildIntegrityGuard(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
