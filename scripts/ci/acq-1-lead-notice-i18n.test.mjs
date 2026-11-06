import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

const OWNER = 'acq-1-lead-notice-i18n-contract';
const LOCALES = ['en', 'sq', 'mk', 'sr'];
const NOTICE_VERSION_FILE = new URL(
  '../../apps/web/src/features/agent/leads/lead-notice.ts',
  import.meta.url
);

function readCatalog(locale, file) {
  const path = `apps/web/src/messages/${locale}/${file}`;
  assert.equal(structuredArtifactOwner(path), OWNER);
  return JSON.parse(fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
}

function assertKeys(notice, keys, label) {
  for (const key of keys) assert.ok(notice?.[key]?.trim(), `${label}.${key}`);
}

test('both lead entry points carry the complete consent notice in every locale', () => {
  // Both entry points store LEAD_NOTICE_VERSION; changing this copy requires a new version.
  assert.match(fs.readFileSync(NOTICE_VERSION_FILE, 'utf8'), /'lead-notice-v1'/u);
  const agentBodies = new Set();
  const publicBodies = new Set();
  for (const locale of LOCALES) {
    const create = readCatalog(locale, 'agent.json').agent.leads_pro.create;
    assertKeys(create.notice, ['title', 'body', 'company', 'attestation'], `${locale}.agent`);
    for (const key of ['duplicate', 'generic']) assert.ok(create.errors[key]?.trim(), locale);
    assert.notEqual(create.errors.duplicate, create.errors.generic, locale);
    agentBodies.add(create.notice.body);

    const form = readCatalog(locale, 'pricing.json').pricing.businessLead.form;
    assertKeys(
      form.notice,
      ['title', 'body', 'company', 'consent', 'consentRequired'],
      `${locale}.public`
    );
    assert.equal(form.privacyNote, undefined, `${locale}: the passive note is retired`);
    publicBodies.add(form.notice.body);
  }
  assert.equal(agentBodies.size, LOCALES.length, 'each locale has its own agent notice');
  assert.equal(publicBodies.size, LOCALES.length, 'each locale has its own public notice');
  assert.equal(structuredArtifactOwner('apps/web/src/messages/de/agent.json'), null);
});
