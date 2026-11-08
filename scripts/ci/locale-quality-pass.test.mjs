import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

const OWNER = 'locale-quality-pass-i18n-contract';
const MESSAGES_DIR = fileURLToPath(new URL('../../apps/web/src/messages/', import.meta.url));
const LOCALES = ['en', 'sq', 'mk', 'sr', 'de'];
const EN_DE = [
  'agent-crm',
  'claimCategories',
  'common',
  'consumerRights',
  'flightJourney',
  'freeStartResultEvidence',
  'hero',
  'propertyJourney',
  'services',
];
const SHARED = [
  'admin-common',
  'admin-crm',
  'claimCategories',
  'common',
  'consumerRights',
  'evidence',
  'hero',
  'legal',
  'staff-crm',
];
const OWNED = {
  en: EN_DE,
  de: EN_DE,
  mk: SHARED,
  sq: [...SHARED, 'admin-dashboard', 'agent-crm', 'auth', 'nps', 'wizard'],
  sr: [...SHARED, 'settings'],
};
const expected = Object.entries(OWNED).flatMap(([locale, names]) =>
  names.map(name => `${locale}/${name}.json`)
);
const catalogs = locale =>
  fs
    .readdirSync(path.join(MESSAGES_DIR, locale))
    .filter(name => name.endsWith('.json'))
    .map(name => `${locale}/${name}`);
const strings = value =>
  typeof value === 'string'
    ? [value]
    : value && typeof value === 'object'
      ? Object.values(value).flatMap(strings)
      : [];
const values = file => strings(JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, file), 'utf8')));

test('the quality pass owns exactly the catalogs it corrected', () => {
  const owned = LOCALES.flatMap(catalogs).filter(
    file => structuredArtifactOwner(`apps/web/src/messages/${file}`) === OWNER
  );
  assert.deepEqual(owned.sort(), expected.sort());
});

test('Serbian catalogs use the Latin script only', () => {
  const cyrillic = /[\u0400-\u04FF]/u;
  const found = catalogs('sr').flatMap(file =>
    values(file)
      .filter(value => cyrillic.test(value))
      .map(value => `${file}: ${value}`)
  );
  assert.deepEqual(found, []);
});

test('Albanian, Macedonian and Serbian copy never shows the English word tenant', () => {
  const found = ['sq', 'mk', 'sr'].flatMap(locale =>
    catalogs(locale).flatMap(file =>
      values(file)
        .filter(value => /\btenants?\b/iu.test(value))
        .map(value => `${file}: ${value}`)
    )
  );
  assert.deepEqual(found, []);
});
