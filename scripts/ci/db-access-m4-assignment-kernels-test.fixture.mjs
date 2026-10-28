import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import { deriveM4AssignmentKernels, FILES } from './db-access-m4-assignment-kernels-source.mjs';
const root =
  process.env.M4_ASSIGNMENT_KERNEL_TEST_ROOT ?? path.resolve(import.meta.dirname, '../..');
export const sources = Object.fromEntries(
  Object.entries(FILES).map(([key, file]) => [
    key + 'Source',
    fs.readFileSync(path.join(root, file), 'utf8'),
  ])
);
export const hash = text => createHash('sha256').update(text).digest('hex');
export const derive = patch => deriveM4AssignmentKernels({ ...sources, ...patch });
export function replace(source, before, after) {
  assert.equal(source.split(before).length, 2, 'unique semantic mutation anchor: ' + before);
  return source.replace(before, after);
}
export function negative(role, label, mutate) {
  test(role + ': ' + label + ' rejects fresh valid source', () => {
    const key = role + 'Source',
      changed = mutate(sources[key]);
    assert.notEqual(hash(changed), hash(sources[key]));
    const parsed = ts.createSourceFile(
      'mutant.ts',
      changed,
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.TS
    );
    assert.equal(parsed.parseDiagnostics.length, 0, 'mutation is syntactically valid');
    assert.throws(
      () => derive({ [key]: changed }),
      /^Error: m4 assignment kernel source rejected:/
    );
  });
}
