import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import {
  DEFAULT_SCAN_ROOTS,
  parseScanArgs,
  toPosixRelative,
  walkSourceFiles,
} from './lib/source-scan.mjs';

const DEFAULT_ALLOWLIST_PATH = 'scripts/raw-role-array-allowlist.json';
const DEFAULT_RAW_ROLE_SCAN_ROOTS = ['apps/web/src', 'packages', 'scripts'];
const SKIPPED_FILES = new Set(['scripts/check-raw-role-arrays.mjs']);
const ROLE_LITERAL_VALUES = new Set(
  'super_admin admin tenant_admin branch_manager staff agent member'.split(' ')
);

function scriptKind(filePath) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) return ts.ScriptKind.TSX;
  return ts.ScriptKind.TS;
}

function isTestFile(relPath) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(relPath);
}

function readAllowlist(root, allowlistPath = DEFAULT_ALLOWLIST_PATH) {
  const absolutePath = path.resolve(root, allowlistPath);
  if (!fs.existsSync(absolutePath)) return new Set();

  const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  if (parsed.version !== 1 || !Array.isArray(parsed.approvedRawRoleArrays)) {
    throw new Error(`Invalid raw role-array allowlist: ${allowlistPath}`);
  }

  return new Set(parsed.approvedRawRoleArrays);
}

function findingKey(finding) {
  return `${finding.file}:${finding.line}:${finding.column}:${finding.roles.join(',')}`;
}

function isRawRoleArray(node) {
  const roles = [];
  for (const element of node.elements) {
    if (!ts.isStringLiteralLike(element)) return null;
    if (!ROLE_LITERAL_VALUES.has(element.text)) return null;
    roles.push(element.text);
  }
  return roles.length === 0 ? null : roles;
}

function findRoleArraysInFile(root, filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath)
  );
  const relPath = toPosixRelative(root, filePath);
  const findings = [];

  function visit(node) {
    if (ts.isArrayLiteralExpression(node)) {
      const roles = isRawRoleArray(node);
      if (roles) {
        const start = node.getStart(sourceFile);
        const position = sourceFile.getLineAndCharacterOfPosition(start);
        findings.push({
          column: position.character + 1,
          file: relPath,
          line: position.line + 1,
          roles,
          text: source.slice(start, node.getEnd()).replace(/\s+/g, ' '),
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

export function findRawRoleArrayViolations(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const scanRoots =
    !options.scanRoots || options.scanRoots === DEFAULT_SCAN_ROOTS
      ? DEFAULT_RAW_ROLE_SCAN_ROOTS
      : options.scanRoots;
  const approved = readAllowlist(root, options.allowlistPath);
  const findings = [];

  for (const scanRoot of scanRoots) {
    for (const filePath of walkSourceFiles(path.resolve(root, scanRoot))) {
      const relPath = toPosixRelative(root, filePath);
      if (SKIPPED_FILES.has(relPath) || isTestFile(relPath)) continue;
      findings.push(...findRoleArraysInFile(root, filePath));
    }
  }

  const discoveredKeys = new Set(findings.map(findingKey));
  return {
    staleApprovals: [...approved].filter(key => !discoveredKeys.has(key)),
    violations: findings.filter(finding => !approved.has(findingKey(finding))),
  };
}

export function runRawRoleArrayGuard(options = {}) {
  const { staleApprovals, violations } = findRawRoleArrayViolations(options);
  if (violations.length === 0 && staleApprovals.length === 0) {
    console.log('Raw role-array guard passed: role-array literals match the approved baseline.');
    return 0;
  }

  if (violations.length > 0) {
    console.error(
      'Raw role-array guard failed: replace inline role arrays with shared-auth helpers or approve the exception.'
    );
    for (const finding of violations) {
      console.error(`- ${finding.file}:${finding.line}:${finding.column} ${finding.text}`);
    }
  }
  if (staleApprovals.length > 0) {
    console.error('Raw role-array allowlist has stale entries:');
    for (const key of staleApprovals) console.error(`- ${key}`);
  }
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runRawRoleArrayGuard(
      parseScanArgs(
        process.argv.slice(2),
        'Usage: node scripts/check-raw-role-arrays.mjs [--root=<repo>] [--scan-root=<path,...>]'
      )
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
