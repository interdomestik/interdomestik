#!/usr/bin/env bash
set -Eeuo pipefail

node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['apps/web/e2e/golden', 'apps/web/e2e/gate'];
const EXCLUDED = new Set(['apps/web/e2e/gate/tenant-resolution.spec.ts']);

const repoPath = filePath => filePath.split(path.sep).join('/');
const lineNumber = (source, index) => source.slice(0, index).split('\n').length;
const mask = text => text.replace(/[^\n]/g, ' ');
const stripComments = source =>
  source.replace(/\/\*[\s\S]*?\*\//g, mask).replace(/\/\/.*/g, mask);

function walk(root, predicate, output = []) {
  if (!fs.existsSync(root)) return output;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) walk(entryPath, predicate, output);
    else if (predicate(entryPath)) output.push(entryPath);
  }
  return output;
}

function splitArgs(source) {
  const args = [];
  let buffer = '';
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (const char of source) {
    if (quote) {
      buffer += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      buffer += char;
      continue;
    }

    if ('([{'.includes(char)) depth += 1;
    if (')]}'.includes(char)) depth -= 1;
    if (char === ',' && depth === 0) {
      args.push(buffer.trim());
      buffer = '';
    } else {
      buffer += char;
    }
  }

  if (buffer.trim()) args.push(buffer.trim());
  return args;
}

function findCloseParen(source, openIndex) {
  let depth = 1;
  let quote = '';
  let escaped = false;
  for (let index = openIndex + 1; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (source[index] === '(') depth += 1;
    if (source[index] === ')') depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

const strictSpecs = ROOTS.flatMap(root =>
  walk(root, filePath => {
    const file = repoPath(filePath);
    return file.endsWith('.spec.ts') && !file.includes('/golden/legacy/') && !EXCLUDED.has(file);
  })
);
const allE2eTs = walk('apps/web/e2e', filePath => repoPath(filePath).endsWith('.ts'));
const violations = [];

for (const filePath of strictSpecs) {
  const file = repoPath(filePath);
  const raw = fs.readFileSync(filePath, 'utf8');
  const source = stripComments(raw);

  for (const match of source.matchAll(/page\.goto\(/g)) {
    violations.push(`${file}:${lineNumber(raw, match.index)} raw goto`);
  }

  for (const match of source.matchAll(/\bgotoApp\s*\(/g)) {
    const openIndex = match.index + match[0].lastIndexOf('(');
    const closeIndex = findCloseParen(source, openIndex);
    if (closeIndex === -1) {
      violations.push(`${file}:${lineNumber(source, match.index)} unclosed gotoApp`);
      continue;
    }
    const args = splitArgs(source.slice(openIndex + 1, closeIndex));
    if (args.length < 4 || !/\bmarker\b/.test(args[3])) {
      violations.push(`${file}:${lineNumber(source, match.index)} gotoApp marker`);
    }
  }
}

for (const filePath of allE2eTs) {
  const file = repoPath(filePath);
  const source = fs.readFileSync(filePath, 'utf8');
  for (const match of source.matchAll(/\/(sq|mk|en|sr|de|hr)\/api/g)) {
    violations.push(`${file}:${lineNumber(source, match.index)} locale API`);
  }
}

if (violations.length > 0) {
  console.error('E2E guard violations');
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('E2E guards passed.');
NODE
