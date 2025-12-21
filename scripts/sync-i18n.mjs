import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const MESSAGES_DIR = path.join(ROOT, 'apps/web/src/messages');
const EN_DIR = path.join(MESSAGES_DIR, 'en');
const TARGET_LOCALES = ['sr', 'mk']; // sq seems fine mostly or we trust it

// Helper to read JSON
function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Helper to write JSON
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

// Deep merge helper: target is the source of truth for VALUES, source is source of truth for STRUCTURE
// We want to fill missing keys in target with values from source.
function merge(target, source) {
  if (target === undefined) return source;
  if (source === undefined) return target; // Should not happen if source is base

  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    // Primitive or array: keep target if it exists, else source
    return target !== undefined ? target : source;
  }

  // Source is object
  if (typeof target !== 'object' || target === null || Array.isArray(target)) {
    // Mismatch type: overwrite with source? Or keep target?
    // If target is primitive but source is object, we must overwrite or we have a schema mismatch.
    // For i18n, assuming source (EN) is correct structure.
    return source;
  }

  const result = { ...target };
  for (const key of Object.keys(source)) {
    result[key] = merge(target[key], source[key]);
  }
  return result;
}

const namespaces = fs
  .readdirSync(EN_DIR)
  .filter(f => f.endsWith('.json'))
  .map(f => f.replace('.json', ''));

console.log(`Syncing ${namespaces.length} namespaces to [${TARGET_LOCALES.join(', ')}]...`);

for (const ns of namespaces) {
  const enPath = path.join(EN_DIR, `${ns}.json`);
  const enData = readJson(enPath);

  if (!enData) continue;

  for (const locale of TARGET_LOCALES) {
    const targetDir = path.join(MESSAGES_DIR, locale);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetPath = path.join(targetDir, `${ns}.json`);
    const targetData = readJson(targetPath);

    let newData;
    if (!targetData) {
      console.log(`[${locale}] Creating missing file: ${ns}.json`);
      newData = enData; // Copy full English data
    } else {
      // Merge missing keys
      newData = merge(targetData, enData);

      // Check if actually changed? (Optimization: skipped for now, just overwrite)
    }

    writeJson(targetPath, newData);
  }
}

console.log('✅ Sync complete!');
