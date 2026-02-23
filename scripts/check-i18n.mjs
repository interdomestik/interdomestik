#!/usr/bin/env node
// Simple i18n completeness check for key namespaces used on landing/wizard.

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const DEFAULT_LOCALES = ['en', 'sq', 'mk', 'sr'];

function parseArgs(argv) {
  const out = { locales: DEFAULT_LOCALES, baseLocale: 'en' };

  for (const arg of argv) {
    if (arg.startsWith('--locales=')) {
      out.locales = arg
        .replace('--locales=', '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    }

    if (arg.startsWith('--base=')) {
      out.baseLocale = arg.replace('--base=', '').trim();
    }
  }

  if (!out.locales.includes(out.baseLocale)) {
    out.locales = [out.baseLocale, ...out.locales];
  }

  return out;
}

const { locales, baseLocale } = parseArgs(process.argv.slice(2));

const MESSAGES_DIR = path.join(ROOT, 'apps/web/src/messages');
const BASE_DIR = path.join(MESSAGES_DIR, baseLocale);
const CRITICAL_LOCALIZED_KEYS = {
  pricing: [
    'pricing.title',
    'pricing.cta',
    'pricing.billedAnnually',
    'pricing.moneyBackGuarantee',
  ],
};

// Auto-discover namespaces from 'en' directory
const namespaces = fs
  .readdirSync(BASE_DIR)
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

function readValue(obj, dottedKey) {
  return dottedKey.split('.').reduce((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return acc[key];
    }
    return undefined;
  }, obj);
}

let failures = [];

console.log(
  `Checking ${namespaces.length} namespaces across locales: ${locales.join(', ')} (base=${baseLocale})...`
);

for (const ns of namespaces) {
  const baseFile = fileFor(baseLocale, ns);
  const base = readJson(baseFile);
  if (!base) {
    // Should not happen as we just read dir
    failures.push(`Base locale missing file: ${ns}`);
    continue;
  }

  // Some files might be flat key-value, others nested under namespace key "ns": { ... }
  // Our standard seems to be { "namespace": { ... } } or just { ... }
  // The flattening should handle both, but we need to compare keys.
  const baseKeys = flatten(base);

  for (const locale of locales.filter(l => l !== baseLocale)) {
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

    for (const dottedKey of CRITICAL_LOCALIZED_KEYS[ns] ?? []) {
      const baseValue = readValue(base, dottedKey);
      const translatedValue = readValue(data, dottedKey);

      if (typeof baseValue !== 'string' || typeof translatedValue !== 'string') {
        failures.push(`[${locale}] invalid critical i18n key ${ns}:${dottedKey}`);
        continue;
      }

      if (baseValue.trim() === translatedValue.trim()) {
        failures.push(`[${locale}] critical i18n key matches base locale: ${ns}:${dottedKey}`);
      }
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
