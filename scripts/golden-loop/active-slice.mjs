#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_AUTHORITY_FILES = [
  'docs/plans/current-program.md',
  'docs/plans/current-tracker.md',
  'docs/plans/architecture-finalization-tracker-2026-05-29.md',
];

const ACTIVE_PATTERNS = [
  /next\s+active\s+governed\s+implementation\s+goal\s+is\s+exactly\s+one\s+canonical\s+tracker\s+slice:\s*`([^`]+)`/giu,
  /`([^`]+)`\s+is now the next active governed implementation goal/giu,
  /next active governed\s+goal,\s*`([^`]+)`/giu,
  /next canonical candidate is\s+`([^`]+)`/giu,
  /next candidate in the canonical architecture tracker is\s+`([^`]+)`/giu,
];

function argValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function sentenceAt(text, index) {
  const start = Math.max(0, text.lastIndexOf('\n', index) + 1);
  const end = text.indexOf('\n', index);
  return text.slice(start, end === -1 ? undefined : end).trim();
}

function isUmbrella(id) {
  return id === 'ARCH-FINAL';
}

export function findConcreteActiveSlice(text, sourceFile = '') {
  const matches = [];
  for (const pattern of ACTIVE_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      matches.push({
        id: match[1],
        sourceFile,
        index: match.index,
        evidence: sentenceAt(text, match.index),
      });
    }
  }

  matches.sort((left, right) => right.index - left.index);
  return matches.find(match => !isUmbrella(match.id)) || null;
}

export function resolveActiveSlice(repoRoot, authorityFiles = DEFAULT_AUTHORITY_FILES) {
  const records = [];
  for (const relativeFile of authorityFiles) {
    const file = path.join(repoRoot, relativeFile);
    if (!fs.existsSync(file)) {
      records.push({ file: relativeFile, status: 'missing' });
      continue;
    }

    const text = fs.readFileSync(file, 'utf8');
    const concrete = findConcreteActiveSlice(text, relativeFile);
    records.push({
      file: relativeFile,
      status: concrete ? 'concrete-active-slice' : 'no-concrete-active-slice',
      concrete,
      archFinalUmbrella: /ARCH-FINAL[^.\n]*(?:umbrella|not an implementation slice)/iu.test(text),
    });
  }

  const active = records.find(record => record.concrete)?.concrete || null;
  return {
    ok: Boolean(active),
    active,
    records,
  };
}

function main() {
  const args = process.argv.slice(2);
  const repoRoot = path.resolve(argValue(args, '--repo', process.cwd()));
  const result = resolveActiveSlice(repoRoot);
  console.log(JSON.stringify({ repoRoot, ...result }, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
