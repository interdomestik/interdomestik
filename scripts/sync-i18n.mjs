#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const MESSAGES_DIR = path.join(ROOT, 'apps/web/src/messages');

const DEFAULT_BASE_LOCALE = 'en';
const DEFAULT_TARGET_LOCALES = ['sq', 'mk', 'sr'];

function parseArgs(argv) {
  const out = {
    baseLocale: DEFAULT_BASE_LOCALE,
    locales: DEFAULT_TARGET_LOCALES,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--base=')) {
      out.baseLocale = arg.replace('--base=', '').trim();
    }

    if (arg.startsWith('--locales=')) {
      out.locales = arg
        .replace('--locales=', '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    }

    if (arg === '--dry-run') {
      out.dryRun = true;
    }
  }

  return out;
}

const { baseLocale, locales: targetLocales, dryRun } = parseArgs(process.argv.slice(2));
const BASE_DIR = path.join(MESSAGES_DIR, baseLocale);

if (!fs.existsSync(BASE_DIR)) {
  console.error(`[i18n:sync] Base locale directory not found: ${BASE_DIR}`);
  process.exit(1);
}

// Helper to read JSON
function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Helper to write JSON
function writeJson(file, data) {
  if (dryRun) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
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
  .readdirSync(BASE_DIR)
  .filter(f => f.endsWith('.json'))
  .map(f => f.replace('.json', ''));

console.log(
  `Syncing ${namespaces.length} namespaces from [${baseLocale}] to [${targetLocales.join(', ')}]${
    dryRun ? ' (dry-run)' : ''
  }...`
);

const actions = [];

for (const ns of namespaces) {
  const basePath = path.join(BASE_DIR, `${ns}.json`);
  const baseData = readJson(basePath);

  if (!baseData) continue;

  for (const locale of targetLocales) {
    const targetPath = path.join(MESSAGES_DIR, locale, `${ns}.json`);
    const targetData = readJson(targetPath);

    let newData;
    if (!targetData) {
      actions.push({ type: 'create', locale, ns });
      newData = baseData; // Copy full base data
    } else {
      // Merge missing keys
      newData = merge(targetData, baseData);

      const changed = JSON.stringify(targetData) !== JSON.stringify(newData);
      if (changed) actions.push({ type: 'update', locale, ns });
      if (!changed) continue;
    }

    writeJson(targetPath, newData);
  }
}

if (!actions.length) {
  console.log('✅ Sync complete! No changes needed.');
  process.exit(0);
}

console.log(`✅ Sync complete! ${dryRun ? 'Planned' : 'Applied'} ${actions.length} change(s):`);
for (const a of actions) {
  console.log(` - ${a.type} [${a.locale}] ${a.ns}.json`);
}
