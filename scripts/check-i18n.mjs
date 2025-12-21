#!/usr/bin/env node
// Simple i18n completeness check for key namespaces used on landing/wizard.

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const locales = ['en', 'sq', 'sr', 'mk'];

const MESSAGES_DIR = path.join(ROOT, 'apps/web/src/messages');
const EN_DIR = path.join(MESSAGES_DIR, 'en');

// Auto-discover namespaces from 'en' directory
const namespaces = fs
  .readdirSync(EN_DIR)
  .filter(f => f.endsWith('.json'))
  .map(f => f.replace('.json', ''));

const fileFor = (locale, namespace) => path.join(MESSAGES_DIR, locale, `${namespace}.json`);

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null; // Handle missing files
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`Failed to read ${file}: ${e.message}`);
  }
}

function flatten(obj, prefix = '') {
  return Object.entries(obj).reduce((acc, [key, val]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      acc.push(...flatten(val, full));
    } else {
      acc.push(full);
    }
    return acc;
  }, []);
}

let failures = [];

console.log(`Checking ${namespaces.length} namespaces across locales: ${locales.join(', ')}...`);

for (const ns of namespaces) {
  const enFile = fileFor('en', ns);
  const base = readJson(enFile);
  if (!base) {
    // Should not happen as we just read dir
    failures.push(`Base locale missing file: ${ns}`);
    continue;
  }

  // Some files might be flat key-value, others nested under namespace key "ns": { ... }
  // Our standard seems to be { "namespace": { ... } } or just { ... }
  // The flattening should handle both, but we need to compare keys.
  const baseKeys = flatten(base);

  for (const locale of locales.filter(l => l !== 'en')) {
    const file = fileFor(locale, ns);
    const data = readJson(file);

    if (!data) {
      failures.push(`[${locale}] missing file: ${ns}.json`);
      continue;
    }

    const keys = flatten(data);
    const missing = baseKeys.filter(k => !keys.includes(k));

    if (missing.length) {
      // Limit output
      const missingStr =
        missing.slice(0, 5).join(', ') +
        (missing.length > 5 ? `... (${missing.length} total)` : '');
      failures.push(`[${locale}] missing keys in ${ns}: ${missingStr}`);
    }
  }
}

if (failures.length) {
  console.error('i18n completeness check failed:');
  failures.forEach(f => console.error(` - ${f}`));
  process.exit(1);
} else {
  console.log('✅ i18n completeness check passed!');
}
