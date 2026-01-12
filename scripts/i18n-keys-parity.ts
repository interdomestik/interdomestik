#!/usr/bin/env node
/**
 * i18n-keys-parity.ts
 *
 * Validates that all locales have identical key structures for specified namespaces.
 * Fails with exit code 1 if any keys are missing.
 *
 * Usage: npx tsx scripts/i18n-keys-parity.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES = ['en', 'sq', 'mk', 'sr'] as const;
const NAMESPACES = ['admin-claims', 'claims'] as const;
const MESSAGES_DIR = path.join(__dirname, '../apps/web/src/messages');

type KeyPath = string;

function getKeyPaths(obj: Record<string, unknown>, prefix = ''): KeyPath[] {
  const keys: KeyPath[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...getKeyPaths(value as Record<string, unknown>, fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys.sort();
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

  for (const namespace of NAMESPACES) {
    console.log(`\n📦 Checking namespace: ${namespace}`);

    const localeKeys: Map<string, Set<KeyPath>> = new Map();
    const allKeys: Set<KeyPath> = new Set();

    // Load all locale keys
    for (const locale of LOCALES) {
      const data = loadNamespace(locale, namespace);
      if (!data) {
        console.error(`   ❌ ${locale}: File not found or invalid`);
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
        console.error(`   ❌ ${locale}: Missing ${missing.length} keys:`);
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
