import assert from 'node:assert/strict';
import test from 'node:test';
import { LOCALE_CATALOG_OWNER_KEYS, structuredArtifactOwner } from './modularity-guard-policy.mjs';

const OWNER = 'qa-localization-i18n-contract';

test('QA catalogs have exact ownership in all five locales', () => {
  for (const locale of ['de', 'en', 'mk', 'sq', 'sr']) {
    assert.equal(
      structuredArtifactOwner(`apps/web/src/messages/${locale}/agent-commissions.json`),
      OWNER
    );
    for (const name of ['agent-toolkit.json', 'entityDisclosure.json']) {
      assert.equal(structuredArtifactOwner(`apps/web/src/messages/${locale}/${name}`), OWNER);
      assert.ok(LOCALE_CATALOG_OWNER_KEYS.includes(name));
      assert.ok(!LOCALE_CATALOG_OWNER_KEYS.includes(`${locale}/${name}`));
    }
  }
  for (const name of [
    'commercialTerms.json',
    'coverageMatrix.json',
    'documents.json',
    'servicesPage.json',
  ]) {
    assert.equal(structuredArtifactOwner(`apps/web/src/messages/sq/${name}`), OWNER);
    assert.equal(structuredArtifactOwner(`apps/web/src/messages/en/${name}`), null);
  }
  for (const denied of [
    'hr/agent-commissions.json',
    'en/agent-commissions-extra.json',
    'en/unknown.json',
    'en/nested/agent-commissions.json',
  ]) {
    assert.equal(structuredArtifactOwner(`apps/web/src/messages/${denied}`), null);
  }
});
