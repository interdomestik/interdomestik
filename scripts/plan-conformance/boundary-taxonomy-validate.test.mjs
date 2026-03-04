import assert from 'node:assert/strict';
import test from 'node:test';

import { validateBoundaryTaxonomy } from './boundary-taxonomy-validate.mjs';

function baseManifest() {
  return {
    no_touch_zones: [
      'apps/web/src/proxy.ts',
      'apps/web/src/lib/proxy-logic.ts',
      '.github/workflows/**',
    ],
  };
}

function baseTaxonomy() {
  return {
    canonical_routes: ['/member', '/agent', '/staff', '/admin'],
    no_touch_patterns: [
      'apps/web/src/proxy.ts',
      'apps/web/src/lib/proxy-logic.ts',
      '.github/workflows/**',
    ],
    protected_patterns: ['apps/web/src/lib/canonical-routes.ts'],
    advisory_watch_patterns: ['apps/web/src/app/**'],
    clarity_markers: ['page-ready', 'staff-page-ready', 'admin-page-ready'],
  };
}

test('accepts a taxonomy aligned to manifest and canonical route contract', () => {
  const result = validateBoundaryTaxonomy({
    taxonomy: baseTaxonomy(),
    manifest: baseManifest(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('fails when canonical routes are incomplete', () => {
  const taxonomy = baseTaxonomy();
  taxonomy.canonical_routes = ['/member', '/agent'];

  const result = validateBoundaryTaxonomy({ taxonomy, manifest: baseManifest() });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' | '), /canonical_routes missing required entries/);
});

test('fails when no-touch patterns drift from manifest', () => {
  const taxonomy = baseTaxonomy();
  taxonomy.no_touch_patterns = ['apps/web/src/proxy.ts'];

  const result = validateBoundaryTaxonomy({ taxonomy, manifest: baseManifest() });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' | '), /no_touch_patterns must exactly match release-gate manifest/);
});
