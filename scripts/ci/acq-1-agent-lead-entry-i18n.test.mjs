import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

const NOTICE_VERSION_FILE = new URL(
  '../../apps/web/src/features/agent/leads/lead-notice.ts',
  import.meta.url
);

test('agent lead entry catalogs carry the complete consent notice in every locale', () => {
  // The stored notice version names this copy; changing it requires a new version.
  assert.match(fs.readFileSync(NOTICE_VERSION_FILE, 'utf8'), /'lead-notice-v1'/u);
  const bodies = new Set();
  for (const locale of ['en', 'sq', 'mk', 'sr']) {
    const path = `apps/web/src/messages/${locale}/agent.json`;
    assert.equal(structuredArtifactOwner(path), 'acq-1-agent-lead-entry-i18n-contract');
    const catalog = JSON.parse(fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
    const create = catalog.agent.leads_pro.create;
    for (const key of ['title', 'body', 'company', 'attestation']) {
      assert.ok(create.notice[key]?.trim(), `${locale}.notice.${key}`);
    }
    for (const key of ['duplicate', 'generic']) assert.ok(create.errors[key]?.trim(), locale);
    assert.notEqual(create.errors.duplicate, create.errors.generic, locale);
    bodies.add(create.notice.body);
  }
  assert.equal(bodies.size, 4, 'each locale has its own notice text');
  assert.equal(structuredArtifactOwner('apps/web/src/messages/de/agent.json'), null);
});
