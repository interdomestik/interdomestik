#!/usr/bin/env node
/**
 * i18n-keys-parity.ts
 *
 * Validates identical namespace files and nested key structures across all locales.
 * Fails with exit code 1 if any namespaces or keys are missing.
 *
 * Usage: npx tsx scripts/i18n-keys-parity.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES = ['en', 'sq', 'mk', 'sr', 'de'] as const;
const MESSAGES_DIR = path.join(__dirname, '../apps/web/src/messages');
const compareText = (left: string, right: string) => left.localeCompare(right);

type KeyPath = string;

function getKeyPaths(obj: unknown, prefix = ''): KeyPath[] {
  if (typeof obj !== 'object' || obj === null) return [];
  const keys: KeyPath[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    keys.push(fullPath, ...getKeyPaths(value, fullPath));
  }
  return keys.sort(compareText);
}

function loadNamespace(locale: string, namespace: string): Record<string, unknown> | null {
  const filePath = path.join(MESSAGES_DIR, locale, `${namespace}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    console.error(`❌ Failed to parse ${locale}/${namespace}.json`);
    return null;
  }
}

function checkParity(): boolean {
  let hasErrors = false;
  const namespaces = new Set<string>();

  for (const locale of LOCALES) {
    try {
      const entries = fs.readdirSync(path.join(MESSAGES_DIR, locale), { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          namespaces.add(entry.name.slice(0, -5));
        }
      }
    } catch {
      console.error(`❌ ${locale}: Locale directory not found or unreadable`);
      hasErrors = true;
    }
  }

  for (const namespace of [...namespaces].sort(compareText)) {
    console.log(`\n📦 Checking namespace: ${namespace}`);

    const localeKeys: Map<string, Set<KeyPath>> = new Map();
    const allKeys: Set<KeyPath> = new Set();

    // Load all locale keys
    for (const locale of LOCALES) {
      const data = loadNamespace(locale, namespace);
      if (!data) {
        console.error(`   ❌ ${locale}/${namespace}.json: File not found or invalid`);
        hasErrors = true;
        continue;
      }

      const keys = getKeyPaths(data);
      localeKeys.set(locale, new Set(keys));
      keys.forEach(k => allKeys.add(k));
      console.log(`   ✓ ${locale}: ${keys.length} keys`);
    }

    // Check for missing keys
    for (const locale of LOCALES) {
      const keys = localeKeys.get(locale);
      if (!keys) continue;

      const missing = [...allKeys].filter(k => !keys.has(k));
      if (missing.length > 0) {
        console.error(`   ❌ ${locale}/${namespace}.json: Missing ${missing.length} keys:`);
        missing.forEach(k => console.error(`      - ${k}`));
        hasErrors = true;
      }
    }
  }

  return !hasErrors;
}

console.log('🔍 i18n Key Parity Check');
console.log('========================');

const success = checkParity();

if (success) {
  console.log('\n✅ All locales have identical key structures');
  process.exit(0);
} else {
  console.error('\n❌ Key parity check failed');
  process.exit(1);
}
