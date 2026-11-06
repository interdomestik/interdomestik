import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

// ACQ-1b: company name and team size moved out of lead notes into their own columns, so the agent
// lead drawer labels them in every locale.
test('agent lead drawer labels company fields in every locale', () => {
  const labels = new Map();
  for (const locale of ['en', 'sq', 'mk', 'sr']) {
    const path = `apps/web/src/messages/${locale}/agent.json`;
    assert.equal(structuredArtifactOwner(path), 'acq-1b-lead-company-fields-i18n-contract');
    const catalog = JSON.parse(fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
    const fields = catalog.agent.leads_pro.fields;
    for (const key of ['company', 'team_size']) {
      assert.equal(typeof fields[key], 'string', `${locale}.${key}`);
      assert.ok(fields[key].trim().length > 0, `${locale}.${key}`);
    }
    assert.notEqual(fields.company, fields.team_size, locale);
    labels.set(locale, fields.team_size);
  }
  // Each locale carries its own wording, not the English fallback.
  for (const locale of ['sq', 'mk', 'sr']) assert.notEqual(labels.get(locale), labels.get('en'));
  assert.equal(structuredArtifactOwner('apps/web/src/messages/de/agent.json'), null);
});
