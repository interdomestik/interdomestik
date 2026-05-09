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

const SIGNED_URL_RESPONSE_HELPER = 'signedUrlResponseInit';
const SIGNED_URL_RESPONSE_ROUTES = new Set([
  'apps/web/src/app/api/documents/[id]/route.ts',
  'apps/web/src/app/api/uploads/route.ts',
]);

function findConsoleBlocks(source) {
  const blocks = [];
  const consoleCallPattern = /console\.(?:error|warn|info|log)\s*\(/g;
  let match;

  while ((match = consoleCallPattern.exec(source))) {
    let depth = 0;
    let end = match.index;

    for (let index = match.index; index < source.length; index += 1) {
      const char = source[index];
      if (char === '(') depth += 1;
      if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }

    blocks.push({ index: match.index, text: source.slice(match.index, end) });
  }

  return blocks;
}

function findAnchorBlocks(source) {
  return Array.from(source.matchAll(/<a\b[^>]*>/g)).map(match => ({
    index: match.index ?? 0,
    text: match[0],
  }));
}

export function findSignedUrlExposureViolations(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const scanRoots = options.scanRoots ?? DEFAULT_SCAN_ROOTS;
  const findings = [];

  for (const scanRoot of scanRoots) {
    const absoluteScanRoot = path.resolve(root, scanRoot);
    for (const filePath of walkSourceFiles(absoluteScanRoot)) {
      const relPath = toPosixRelative(root, filePath);
      if (/\.(test|spec)\.[tj]sx?$/.test(relPath)) continue;

      const source = fs.readFileSync(filePath, 'utf8');

      for (const block of findConsoleBlocks(source)) {
        if (/\bsignedUrl\b|\.signedUrl\b|\btoken\b.*\bsignedUrl\b/s.test(block.text)) {
          findings.push({
            file: relPath,
            line: lineForIndex(source, block.index),
            reason: 'signed URL value may be logged',
          });
        }
      }

      if (SIGNED_URL_RESPONSE_ROUTES.has(relPath) && !source.includes(SIGNED_URL_RESPONSE_HELPER)) {
        findings.push({
          file: relPath,
          line: 1,
          reason: 'signed URL API response must use no-store and no-referrer headers',
        });
      }

      if (
        SIGNED_URL_RESPONSE_ROUTES.has(relPath) &&
        /Cache-Control['"]?\s*:\s*['"]public/i.test(source)
      ) {
        findings.push({
          file: relPath,
          line: lineForIndex(source, source.search(/Cache-Control/i)),
          reason: 'signed URL API response must not be public-cacheable',
        });
      }

      for (const block of findAnchorBlocks(source)) {
        if (
          /href=\{[^}]*\burl\b[^}]*\}/.test(block.text) &&
          !/\brel=["'][^"']*noreferrer/.test(block.text)
        ) {
          findings.push({
            file: relPath,
            line: lineForIndex(source, block.index),
            reason: 'anchor with URL-bearing href must use noreferrer semantics',
          });
        }
      }
    }
  }

  return findings;
}

export function runSignedUrlExposureGuard(options = {}) {
  const findings = findSignedUrlExposureViolations(options);

  if (findings.length === 0) {
    console.log('Signed URL exposure guard passed: headers, logs, and anchors are bounded.');
    return 0;
  }

  console.error('Signed URL exposure guard failed: signed URL exposure controls are incomplete.');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.reason}`);
  }
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runSignedUrlExposureGuard(
      parseScanArgs(
        process.argv.slice(2),
        'Usage: node scripts/check-signed-url-exposure.mjs [--root=<repo>] [--scan-root=<path,...>]'
      )
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
