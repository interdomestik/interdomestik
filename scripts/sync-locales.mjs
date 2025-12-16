import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.resolve(__dirname, '../apps/web/src/messages');
const LOCALES = ['sq', 'en', 'sr', 'mk'];
const CANONICAL_LOCALE = 'sq'; // User has been updating sq.json most recently

function readJsonResult(locale) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonResult(locale, data) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// Deep merge helper that ensures target has all keys from source
function syncKeys(source, target) {
  // Handle Array
  if (Array.isArray(source)) {
    // If target is not an array (missing or corrupted as object), use source
    if (!Array.isArray(target)) {
      return JSON.parse(JSON.stringify(source));
    }

    // If both are arrays, ensure target has at least as many items as source
    // We assume order matters and maps 1:1
    const newArray = [...target];
    source.forEach((item, index) => {
      if (newArray[index] === undefined) {
        newArray[index] = JSON.parse(JSON.stringify(item));
      } else if (typeof item === 'object' && item !== null) {
        newArray[index] = syncKeys(item, newArray[index]);
      }
    });
    return newArray;
  }

  // Handle Object
  if (typeof source === 'object' && source !== null) {
    // If target is not an object (or is array/null), use source (empty object or structure)
    // But we need to be careful not to adhere to the existing target if it's the wrong type
    let result =
      target && typeof target === 'object' && !Array.isArray(target) ? { ...target } : {};

    for (const key in source) {
      if (typeof source[key] === 'object' && source[key] !== null) {
        // Recursively sync
        result[key] = syncKeys(source[key], result[key]);
      } else {
        // Primitive
        if (result[key] === undefined) {
          result[key] = source[key];
        }
      }
    }
    return result;
  }

  // Primitive source (shouldn't happen with the recursive calls usually, but safe fallback)
  return target !== undefined ? target : source;
}

function main() {
  console.log(`Using ${CANONICAL_LOCALE} as the canonical source.`);
  const sourceData = readJsonResult(CANONICAL_LOCALE);

  LOCALES.forEach(locale => {
    if (locale === CANONICAL_LOCALE) return;

    console.log(`Syncing ${locale}...`);
    const targetData = readJsonResult(locale);

    // We need to compare specific keys that might have been corrupted (cases, steps, faq)
    // or just run full sync which now handles type mismatches.
    const syncedData = syncKeys(sourceData, targetData);

    writeJsonResult(locale, syncedData);
  });

  console.log('Locale synchronization complete.');
}

main();
