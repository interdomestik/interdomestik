import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_LOCALES = ['en', 'sq', 'mk', 'sr'];

const SERBIAN_GLOSSARY_PREFERENCES = new Map([
  ['Podrska', 'Podrška'],
  ['podrska', 'podrška'],
  ['clan', 'član'],
  ['Clan', 'Član'],
  ['clana', 'člana'],
  ['clanu', 'članu'],
  ['clanom', 'članom'],
  ['clanovi', 'članovi'],
  ['clanstvo', 'članstvo'],
  ['Clanstvo', 'Članstvo'],
  ['clanstva', 'članstva'],
  ['clanstvu', 'članstvu'],
  ['clanski', 'članski'],
  ['clanska', 'članska'],
  ['clanske', 'članske'],
  ['clansko', 'člansko'],
  ['Clanski', 'Članski'],
  ['upucivanje', 'upućivanje'],
  ['Upucivanje', 'Upućivanje'],
  ['upucivati', 'upućivati'],
  ['upucuje', 'upućuje'],
  ['upucuju', 'upućuju'],
  ['pocetni', 'početni'],
  ['Pocetni', 'Početni'],
  ['pocetna', 'početna'],
  ['Pocetna', 'Početna'],
  ['pocetne', 'početne'],
  ['Pocetne', 'Početne'],
  ['pocetno', 'početno'],
  ['sledeci', 'sledeći'],
  ['Sledeci', 'Sledeći'],
  ['sledeca', 'sledeća'],
  ['sledece', 'sledeće'],
  ['sledeceg', 'sledećeg'],
  ['sledecem', 'sledećem'],
  ['sledecu', 'sledeću'],
  ['saglasnoscu', 'saglasnošću'],
  ['Saglasnoscu', 'Saglasnošću'],
]);

const SERBIAN_GLOSSARY_REGEX = new RegExp(
  `\\b(${[...SERBIAN_GLOSSARY_PREFERENCES.keys()]
    .sort((left, right) => right.length - left.length)
    .join('|')})\\b`,
  'gu'
);

export function parseArgs(argv) {
  const out = { locales: DEFAULT_LOCALES, baseLocale: 'en', root: process.cwd() };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg.startsWith('--locales=')) {
      out.locales = arg
        .replace('--locales=', '')
        .split(',')
        .map(segment => segment.trim())
        .filter(Boolean);
      continue;
    }

    if (arg === '--locales') {
      const value = argv[index + 1]?.trim();
      if (value) {
        out.locales = value
          .split(',')
          .map(segment => segment.trim())
          .filter(Boolean);
        index += 1;
      }
      continue;
    }

    if (arg.startsWith('--base=')) {
      const value = arg.replace('--base=', '').trim();
      if (value) {
        out.baseLocale = value;
      }
      continue;
    }

    if (arg === '--base') {
      const value = argv[index + 1]?.trim();
      if (value) {
        out.baseLocale = value;
        index += 1;
      }
      continue;
    }

    if (arg.startsWith('--root=')) {
      const value = arg.replace('--root=', '').trim();
      if (value) {
        out.root = path.resolve(value);
      }
      continue;
    }

    if (arg === '--root') {
      const value = argv[index + 1]?.trim();
      if (value) {
        out.root = path.resolve(value);
        index += 1;
      }
    }
  }

  if (!out.locales.includes(out.baseLocale)) {
    out.locales = [out.baseLocale, ...out.locales];
  }

  return out;
}

export function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to read ${file}: ${error.message}`);
  }
}

export function flatten(value, prefix = '') {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => flatten(entry, `${prefix}[${index}]`));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => {
      const full = prefix ? `${prefix}.${key}` : key;
      return flatten(entry, full);
    });
  }

  return prefix ? [prefix] : [];
}

function collectStringEntries(value, prefix = '') {
  if (typeof value === 'string') {
    return prefix ? [{ path: prefix, value }] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectStringEntries(entry, `${prefix}[${index}]`));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => {
      const full = prefix ? `${prefix}.${key}` : key;
      return collectStringEntries(entry, full);
    });
  }

  return [];
}

function fileFor(root, locale, namespace) {
  return path.join(root, 'apps/web/src/messages', locale, `${namespace}.json`);
}

function listNamespaces(root, baseLocale) {
  const baseDir = path.join(root, 'apps/web/src/messages', baseLocale);
  return fs
    .readdirSync(baseDir)
    .filter(entry => entry.endsWith('.json'))
    .map(entry => entry.replace('.json', ''));
}

function collectSerbianOrthographyFailures(namespace, data) {
  const offendingEntries = [];

  for (const entry of collectStringEntries(data)) {
    const matches = entry.value.match(SERBIAN_GLOSSARY_REGEX) ?? [];
    if (!matches.length) continue;

    offendingEntries.push({
      path: entry.path,
      suggestions: [...new Set(matches)].map(
        token => `${token} -> ${SERBIAN_GLOSSARY_PREFERENCES.get(token)}`
      ),
    });
  }

  if (!offendingEntries.length) {
    return [];
  }

  const suggestions = [...new Set(offendingEntries.flatMap(entry => entry.suggestions))].slice(0, 6);
  const paths = offendingEntries
    .slice(0, 3)
    .map(entry => entry.path)
    .join(', ');

  return [
    `[sr] orthography regression in ${namespace}: ${paths} use ASCII fallbacks (${suggestions.join(', ')})`,
  ];
}

export function collectI18nFailures({ root = process.cwd(), locales, baseLocale }) {
  const failures = [];
  const namespaces = listNamespaces(root, baseLocale);

  for (const namespace of namespaces) {
    const base = readJson(fileFor(root, baseLocale, namespace));
    if (!base) {
      failures.push(`Base locale missing file: ${namespace}`);
      continue;
    }

    const baseKeys = flatten(base);

    for (const locale of locales.filter(entry => entry !== baseLocale)) {
      const data = readJson(fileFor(root, locale, namespace));

      if (!data) {
        failures.push(`[${locale}] missing file: ${namespace}.json`);
        continue;
      }

      const keys = flatten(data);
      const missing = baseKeys.filter(key => !keys.includes(key));

      if (missing.length) {
        const preview =
          missing.slice(0, 5).join(', ') +
          (missing.length > 5 ? `... (${missing.length} total)` : '');
        failures.push(`[${locale}] missing keys in ${namespace}: ${preview}`);
      }

      if (locale === 'sr') {
        failures.push(...collectSerbianOrthographyFailures(namespace, data));
      }
    }
  }

  return failures;
}
