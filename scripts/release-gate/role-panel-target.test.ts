import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { resolveConfiguredRolePanelTarget } = require('./admin-checks.ts');

test('resolveConfiguredRolePanelTarget uses isolated pack member as default role probe', () => {
  const originalTarget = process.env.RELEASE_GATE_TARGET_USER_URL;
  try {
    delete process.env.RELEASE_GATE_TARGET_USER_URL;
    const resolved = resolveConfiguredRolePanelTarget({
      baseUrl: 'https://interdomestik-web.vercel.app',
      locale: 'en',
    });

    assert.equal(resolved.source, 'default');
    assert.equal(resolved.allowFallbackDiscovery, true);
    assert.equal(
      resolved.targetUrl,
      'https://interdomestik-web.vercel.app/en/admin/users/pack_ks_member_1?tenantId=tenant_ks'
    );
  } finally {
    if (originalTarget !== undefined) {
      process.env.RELEASE_GATE_TARGET_USER_URL = originalTarget;
    }
  }
});
