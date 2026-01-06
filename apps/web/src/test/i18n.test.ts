/**
 * i18n Translation Completeness Tests
 *
 * Ensures all translation files have consistent keys across all locales.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

type TranslationValue =
  | string
  | number
  | boolean
  | null
  | TranslationValue[]
  | { [key: string]: TranslationValue };
type TranslationObject = { [key: string]: TranslationValue };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MESSAGES_DIR = path.resolve(__dirname, '../messages');

function loadLocale(locale: string): TranslationObject {
  const localeDir = path.join(MESSAGES_DIR, locale);
  const files = fs.readdirSync(localeDir).filter(file => file.endsWith('.json'));

  return files.reduce<TranslationObject>((acc, file) => {
    const data = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
    return { ...acc, ...data };
  }, {});
}

const en = loadLocale('en');
const sq = loadLocale('sq');

/**
 * Recursively extract all keys from a nested object.
 * Returns keys in dot notation (e.g., "common.buttons.submit")
 * Handles arrays by treating them as leaf values.
 */
function getAllKeys(obj: TranslationObject, prefix = ''): string[] {
  const keys: string[] = [];

  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (Array.isArray(value)) {
      // Arrays are treated as leaf values
      keys.push(fullKey);
    } else if (typeof value === 'object' && value !== null) {
      keys.push(...getAllKeys(value as TranslationObject, fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys.sort();
}

/**
 * Find keys that exist in source but not in target.
 */
function findMissingKeys(sourceKeys: string[], targetKeys: string[]): string[] {
  const targetSet = new Set(targetKeys);
  return sourceKeys.filter(key => !targetSet.has(key));
}

/**
 * Get value at a dot-notation path.
 */
function getValueAtPath(obj: TranslationObject, path: string): TranslationValue | undefined {
  const parts = path.split('.');
  let current: TranslationValue | undefined = obj;

  for (const part of parts) {
    if (current && typeof current === 'object' && !Array.isArray(current) && part in current) {
      current = (current as TranslationObject)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Translation Files', () => {
  const enKeys = getAllKeys(en as TranslationObject);
  const sqKeys = getAllKeys(sq as TranslationObject);

  describe('Key Consistency', () => {
    it('should have English as the source of truth', () => {
      expect(enKeys.length).toBeGreaterThan(0);
    });

    it('should have Albanian translations for all English keys', () => {
      const missingInSq = findMissingKeys(enKeys, sqKeys);

      if (missingInSq.length > 0) {
        console.log('Missing keys in sq.json:', missingInSq);
      }

      expect(missingInSq).toHaveLength(0);
    });

    it('should allow extra keys in Albanian (informational)', () => {
      const extraInSq = findMissingKeys(sqKeys, enKeys);
      expect(Array.isArray(extraInSq)).toBe(true);
    });
  });

  describe('Value Integrity', () => {
    it('should not have empty string values in English', () => {
      const emptyValues = enKeys.filter(key => {
        const value = getValueAtPath(en as TranslationObject, key);
        return value === '';
      });

      if (emptyValues.length > 0) {
        console.log('Empty values in en.json:', emptyValues);
      }

      expect(emptyValues).toHaveLength(0);
    });

    it('should not have empty string values in Albanian', () => {
      const emptyValues = sqKeys.filter(key => {
        const value = getValueAtPath(sq as TranslationObject, key);
        return value === '';
      });

      if (emptyValues.length > 0) {
        console.log('Empty values in sq.json:', emptyValues);
      }

      expect(emptyValues).toHaveLength(0);
    });

    it('should not have placeholder TODO values', () => {
      const todoPattern = /TODO|FIXME|XXX|PLACEHOLDER/i;

      const todosInEn = enKeys.filter(key => {
        const value = getValueAtPath(en as TranslationObject, key);
        return typeof value === 'string' && todoPattern.test(value);
      });

      const todosInSq = sqKeys.filter(key => {
        const value = getValueAtPath(sq as TranslationObject, key);
        return typeof value === 'string' && todoPattern.test(value);
      });

      expect(todosInEn).toHaveLength(0);
      expect(todosInSq).toHaveLength(0);
    });
  });

  describe('Interpolation Variables', () => {
    it('should have matching interpolation variables in all locales', () => {
      const variablePattern = /\{(\w+)\}/g;
      const mismatches: string[] = [];

      for (const key of enKeys) {
        const enValue = getValueAtPath(en as TranslationObject, key);
        const sqValue = getValueAtPath(sq as TranslationObject, key);

        if (typeof enValue === 'string' && typeof sqValue === 'string') {
          const enVars = [...enValue.matchAll(variablePattern)].map(m => m[1]).sort();
          const sqVars = [...sqValue.matchAll(variablePattern)].map(m => m[1]).sort();

          if (JSON.stringify(enVars) !== JSON.stringify(sqVars)) {
            mismatches.push(`${key}: EN has {${enVars.join(', ')}}, SQ has {${sqVars.join(', ')}}`);
          }
        }
      }

      if (mismatches.length > 0) {
        console.log('Interpolation variable mismatches:', mismatches);
      }

      expect(mismatches).toHaveLength(0);
    });
  });

  describe('Namespace Structure', () => {
    it('should have common namespace', () => {
      expect(en).toHaveProperty('common');
      expect(sq).toHaveProperty('common');
    });

    it('should have claims namespace', () => {
      expect(en).toHaveProperty('claims');
      expect(sq).toHaveProperty('claims');
    });

    it('should have dashboard namespace', () => {
      expect(en).toHaveProperty('dashboard');
      expect(sq).toHaveProperty('dashboard');
    });

    it('should have metadata namespace', () => {
      expect(en).toHaveProperty('metadata');
      expect(sq).toHaveProperty('metadata');
    });
  });

  describe('Key Count Summary', () => {
    it('should report statistics', () => {
      expect(enKeys.length).toBeGreaterThan(0);
    });
  });
});
