import fs from 'node:fs';
import path from 'node:path';
import { exact, hash, refuse } from './db-access-provider-runtime-identity.mjs';
import { label, safeMember } from './db-access-crm-runtime-graph.mjs';

const fail = reason => refuse('crm package patch: ' + reason);

const HUNK = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/u;
const HEADER = /^(---|\+\+\+) (.+?)(?:\t.*)?$/u;
const UNVERIFIABLE =
  /^(?:rename (?:from|to)|copy (?:from|to)|deleted file mode|GIT binary patch|Binary files)/u;
const APPLY_FAILURE = /FAILED|Reversed|Ignoring|malformed|cannot find/iu;

// -p1 semantics: strip exactly one leading component.
function stripOne(target) {
  const parts = target.split('/');
  if (parts.length < 2) fail('patch target depth ' + target.slice(0, 80));
  return parts.slice(1).join('/');
}

// Hunk bodies are counted so a minified "+++ x" payload line is never read as a file header.
export function patchTargets(text) {
  const targets = new Set();
  let old = 0;
  let next = 0;
  for (const line of text.split('\n')) {
    if (old > 0 || next > 0) {
      if (line.startsWith('\\')) continue;
      if (line.startsWith('-')) old--;
      else if (line.startsWith('+')) next--;
      else if (line.startsWith(' ') || line === '') {
        old--;
        next--;
      } else fail('patch hunk body');
      if (old < 0 || next < 0) fail('patch hunk body');
      continue;
    }
    const hunk = HUNK.exec(line);
    if (hunk) {
      old = hunk[1] === undefined ? 1 : Number(hunk[1]);
      next = hunk[2] === undefined ? 1 : Number(hunk[2]);
      continue;
    }
    if (UNVERIFIABLE.test(line)) fail('unverifiable patch directive');
    const header = HEADER.exec(line);
    if (!header) continue;
    if (header[2] === '/dev/null') {
      if (header[1] === '+++') fail('patch deletes a file');
      continue;
    }
    targets.add(stripOne(header[2]));
  }
  if (old !== 0 || next !== 0) fail('patch hunk truncated');
  return targets;
}

export function applyCrmPatch({ record, sourceRoot, directory, slotDir, run }) {
  const patch = record.patch;
  const bytes = exact(sourceRoot, patch.file, patch);
  if (hash(bytes) !== patch.lockHash) fail('patch lock hash ' + patch.file);
  const targets = patchTargets(bytes.toString('utf8'));
  const expected = Object.keys(patch.patchedFiles);
  for (const target of targets) {
    if (!safeMember(target)) fail('patch target path ' + target.slice(0, 80));
    if (!expected.includes(target)) fail('unverified patch target ' + target);
  }
  for (const file of expected) if (!targets.has(file)) fail('missing patch target ' + file);
  const file = path.join(slotDir, 'package.patch');
  fs.writeFileSync(file, bytes, { mode: 0o600 });
  const applied = run('/usr/bin/patch', ['-p1', '-t', '-N', '-i', file], directory);
  if (APPLY_FAILURE.test(applied)) fail('patch application ' + label(record));
  const patchedFiles = {};
  for (const [name, digest] of Object.entries(patch.patchedFiles)) {
    const target = path.join(directory, name);
    if (
      !fs.existsSync(target) ||
      !fs.lstatSync(target).isFile() ||
      fs.realpathSync(target) !== target
    )
      fail('patched file ' + name);
    const actual = hash(fs.readFileSync(target));
    if (actual !== digest) fail('patched file identity ' + patch.file + ' ' + name);
    patchedFiles[name] = actual;
  }
  return {
    package: label(record),
    file: patch.file,
    mode: patch.mode,
    bytes: bytes.length,
    sha256: hash(bytes),
    lockHash: patch.lockHash,
    targets: [...targets].sort(),
    patchedFiles,
  };
}
