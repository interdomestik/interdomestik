import assert from 'node:assert/strict';
import test from 'node:test';

import { createTempRoot, runScript, writeFile } from './plan-test-helpers.mjs';
import { collectI18nFailures } from './check-i18n-lib.mjs';

function writeMessagesFixture(root, { srDescription }) {
  writeFile(root, 'apps/web/src/messages/en/servicesPage.json', JSON.stringify({
    servicesPage: {
      meta: {
        description: 'Support focused on vehicle, property, and injury matters.',
      },
    },
  }));

  writeFile(root, 'apps/web/src/messages/sq/servicesPage.json', JSON.stringify({
    servicesPage: {
      meta: {
        description: 'Mbështetje për çështjet e automjeteve, pronës dhe lëndimeve.',
      },
    },
  }));

  writeFile(root, 'apps/web/src/messages/mk/servicesPage.json', JSON.stringify({
    servicesPage: {
      meta: {
        description: 'Poddrshka za vozila, imot i povredi.',
      },
    },
  }));

  writeFile(root, 'apps/web/src/messages/sr/servicesPage.json', JSON.stringify({
    servicesPage: {
      meta: {
        description: srDescription,
      },
    },
  }));
}

test('collectI18nFailures reports Serbian orthography regressions with preferred spellings', () => {
  const root = createTempRoot('check-i18n-orthography-');
  writeMessagesFixture(root, {
    srDescription: 'Podrska i clanstvo sa upucivanje za sledeci korak.',
  });

  const failures = collectI18nFailures({
    root,
    locales: ['en', 'sq', 'mk', 'sr'],
    baseLocale: 'en',
  });

  assert.equal(failures.length, 1);
  assert.match(failures[0], /\[sr\] orthography regression in servicesPage/);
  assert.match(failures[0], /Podrska -> Podrška/);
  assert.match(failures[0], /clanstvo -> članstvo/);
});

test('check-i18n CLI fails for Serbian ASCII fallback spellings', () => {
  const root = createTempRoot('check-i18n-cli-');
  writeMessagesFixture(root, {
    srDescription: 'Podrska i clanstvo sa upucivanje za sledeci korak.',
  });

  const result = runScript('scripts/check-i18n.mjs', root);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /\[sr\] orthography regression in servicesPage/);
  assert.match(result.stderr, /upucivanje -> upućivanje/);
});
