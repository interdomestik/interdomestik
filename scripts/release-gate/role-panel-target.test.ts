import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { resolveConfiguredRolePanelTarget } = require('./admin-checks.ts');
const { buildRolePanelDiscoveryUrls } = require('./role-panel-targets.ts');

test('resolveConfiguredRolePanelTarget uses a non-login member as default role probe', () => {
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
      'https://interdomestik-web.vercel.app/en/admin/users/golden_ks_a_member_1?tenantId=tenant_ks'
    );
  } finally {
    if (originalTarget !== undefined) {
      process.env.RELEASE_GATE_TARGET_USER_URL = originalTarget;
    }
  }
});

test('buildRolePanelDiscoveryUrls tries same-tenant safe member fallbacks for default target', () => {
  const urls = buildRolePanelDiscoveryUrls(
    { baseUrl: 'https://interdomestik-web.vercel.app', locale: 'en' },
    {
      source: 'default',
      allowFallbackDiscovery: true,
      targetUrl:
        'https://interdomestik-web.vercel.app/en/admin/users/golden_ks_a_member_1?tenantId=tenant_ks',
    }
  );

  assert.deepEqual(urls, [
    'https://interdomestik-web.vercel.app/en/admin/users/golden_ks_a_member_1?tenantId=tenant_ks',
    'https://interdomestik-web.vercel.app/en/admin/users/golden_ks_a_member_2?tenantId=tenant_ks',
    'https://interdomestik-web.vercel.app/en/admin/users/golden_ks_a_member_3?tenantId=tenant_ks',
    'https://interdomestik-web.vercel.app/en/admin/users/golden_ks_a_member_4?tenantId=tenant_ks',
    'https://interdomestik-web.vercel.app/en/admin/users/golden_ks_a_member_5?tenantId=tenant_ks',
    'https://interdomestik-web.vercel.app/en/admin/users/golden_ks_a_member_6?tenantId=tenant_ks',
  ]);
});
