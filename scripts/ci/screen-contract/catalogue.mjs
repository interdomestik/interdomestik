// The English message catalogue (apps/web/src/messages/en/**), merged, for CHK-22's label text.
import fs from 'node:fs';
import path from 'node:path';

import { ScanError, byCodeUnit } from '../server-mutation/ast.mjs';

const DIR = 'apps/web/src/messages/en';
const catalogues = new Map();
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function merge(into, from) {
  for (const [key, value] of Object.entries(from))
    if (isPlainObject(value) && isPlainObject(into[key])) merge(into[key], value);
    else into[key] = value;
}

export function catalogueFor(root) {
  if (catalogues.has(root)) return catalogues.get(root);
  const dir = path.join(root, DIR);
  if (!fs.existsSync(dir)) throw new ScanError(`${DIR} is missing`);
  const files = [];
  const walk = abs => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true }))
      if (entry.isDirectory()) walk(path.join(abs, entry.name));
      else if (entry.name.endsWith('.json')) files.push(path.join(abs, entry.name));
  };
  walk(dir);
  if (!files.length) throw new ScanError(`${DIR} has no catalogue file`);
  const merged = {};
  for (const file of files.sort(byCodeUnit)) {
    const rel = path.relative(root, file);
    const text = fs.readFileSync(file, 'utf8');
    if (!text.trim()) throw new ScanError(`${rel} is empty`);
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ScanError(`${rel} is not valid JSON`);
    }
    if (!isPlainObject(data)) throw new ScanError(`${rel} is not an object`);
    merge(merged, data);
  }
  catalogues.set(root, merged);
  return merged;
}

// The text of a dotted key, or null when the catalogue has no string there.
export function messageText(catalogue, key) {
  let node = catalogue;
  for (const part of key.split('.')) {
    if (!isPlainObject(node) || !(part in node)) return null;
    node = node[part];
  }
  return typeof node === 'string' ? node : null;
}
