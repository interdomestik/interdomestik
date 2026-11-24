// Fixtures shared by the track-audit contract tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditContract } from '../track-audit.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const quiet = { log() {}, error() {} };

export function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idct-track-'));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

export function audit(files, checks) {
  const dir = fixture(files);
  try {
    return auditContract({ version: 1, checks }, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export const SRC = { 'src/a.ts': 'import x from "seed";\n', 'src/b.ts': 'const ok = 1;\n' };
export const noSeed = extra => ({
  id: 'no_seed',
  type: 'regex',
  targets: ['src/*.ts'],
  must_not_match: ['seed'],
  ...extra,
});
export const reason = 'a test that reads seed rows as expected data';
