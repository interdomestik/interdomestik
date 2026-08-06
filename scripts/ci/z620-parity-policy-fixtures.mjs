import fs from 'node:fs';
import path from 'node:path';
import { loadZ620Gates } from './z620-gates-loader.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
export const parity = JSON.parse(
  fs.readFileSync(path.join(root, 'scripts/ci/z620-parity.json'), 'utf8')
);
export const gates = loadZ620Gates(root, parity.sourceDigests);
