import assert from 'node:assert/strict';
import test from 'node:test';

const { formatMissingEnvSummary } = require('./env-log-redaction.ts');

test('missing env summary reports count without raw secret names', () => {
  const message = formatMissingEnvSummary(2);

  assert.equal(message, '[release-gate] Missing required env vars count=2; names redacted');
  assert.doesNotMatch(message, /PASSWORD|TOKEN|SECRET|KEY|DATABASE_URL/i);
});
