#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from './tenant-guard/rules.mjs';
import {
  collectUnits,
  fingerprint,
  isFunctionLike,
  parseSource,
  unitName,
} from './tenant-guard/syntax.mjs';

// Prints a source-bound contract entry for review:
//   node scripts/ci/tenant-guard-contract.mjs <file> <unit> <kind>=<count>... --reason "<why>"
// The entry pins the unit's normalized text; any later edit to the unit voids it.
const args = process.argv.slice(2);
const reasonIndex = args.indexOf('--reason');
const reason = reasonIndex >= 0 ? args[reasonIndex + 1] : null;
const positional = reasonIndex >= 0 ? args.slice(0, reasonIndex) : args;
const [file, unit, ...kindArgs] = positional;
if (!file || !unit || kindArgs.length === 0 || !reason) {
  console.error(
    'usage: tenant-guard-contract.mjs <file> <unit> <kind>=<count>... --reason "<why>"'
  );
  process.exit(2);
}
// Only a file inside this repository can be pinned.
const repoRoot = path.resolve(import.meta.dirname, '../..');
const fullPath = path.resolve(repoRoot, file);
if (!fullPath.startsWith(repoRoot + path.sep)) {
  console.error(`${file} is not inside the repository`);
  process.exit(2);
}
const sourceFile = parseSource(file, fs.readFileSync(fullPath, 'utf8'));
const named = collectUnits(sourceFile).filter(
  candidate => unitName(candidate, sourceFile) === unit
);
// `export const f = () => ...` names both the statement and the function; operations live in the function.
const functions = named.filter(isFunctionLike);
const matches = functions.length > 0 ? functions : named;
if (matches.length !== 1) {
  console.error(`expected exactly one unit named ${unit} in ${file}, found ${matches.length}`);
  process.exit(2);
}
const kinds = Object.fromEntries(
  kindArgs.map(entry => {
    const [kind, count] = entry.split('=');
    return [kind, Number(count)];
  })
);
console.log(
  JSON.stringify({ file, unit, kinds, sha256: sha256(fingerprint(matches[0], sourceFile)), reason })
);
