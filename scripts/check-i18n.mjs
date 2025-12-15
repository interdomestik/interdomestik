#!/usr/bin/env node
// Simple i18n completeness check for key namespaces used on landing/wizard.

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const locales = ['en', 'sq', 'sr', 'mk'];
const namespaces = ['hero', 'trust', 'nav'];
const fileFor = locale => path.join(ROOT, 'apps/web/src/messages', `${locale}.json`);

function readJson(file) {
  try {
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

const base = readJson(fileFor('en'));
let failures = [];

for (const ns of namespaces) {
  const baseSection = base[ns];
  if (!baseSection) {
    failures.push(`Base locale missing namespace: ${ns}`);
    continue;
  }
  const baseKeys = flatten(baseSection, ns);

  for (const locale of locales.filter(l => l !== 'en')) {
    const data = readJson(fileFor(locale));
    const section = data[ns];
    if (!section) {
      failures.push(`[${locale}] missing namespace: ${ns}`);
      continue;
    }
    const keys = flatten(section, ns);
    const missing = baseKeys.filter(k => !keys.includes(k));
    if (missing.length) {
      failures.push(`[${locale}] missing keys in ${ns}: ${missing.join(', ')}`);
    }
  }
}

if (failures.length) {
  console.error('i18n completeness check failed:');
  failures.forEach(f => console.error(` - ${f}`));
  process.exit(1);
} else {
  console.log('i18n completeness check passed for namespaces:', namespaces.join(', '));
}
