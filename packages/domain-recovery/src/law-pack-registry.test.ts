import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  InvalidLawPackError,
  UnsupportedLawPackCountryError,
  clearLawPackCacheForTests,
  createLawPackRegistry,
  loadLawPack,
} from './index';

test('loads and caches only the requested recovery law pack', async () => {
  let xkLoads = 0;
  let mkLoads = 0;
  const registry = createLawPackRegistry({
    XK: () => {
      xkLoads += 1;
      return {
        countryCode: 'XK',
        recoveryLaw: 'XK',
        recoveryLegalTenantId: 'tenant_ks',
        regulatedActivityNoteRequired: true,
        owner: 'domain-recovery-test',
        effectiveFrom: '2026-06-13',
        lastReviewed: '2026-06-13',
        sourceReferences: ['test:xk'],
      };
    },
    MK: () => {
      mkLoads += 1;
      return {
        countryCode: 'MK',
        recoveryLaw: 'MK',
        recoveryLegalTenantId: 'tenant_mk',
        regulatedActivityNoteRequired: true,
        owner: 'domain-recovery-test',
        effectiveFrom: '2026-06-13',
        lastReviewed: '2026-06-13',
        sourceReferences: ['test:mk'],
      };
    },
  });

  const first = await registry.loadLawPack(' xk ');
  const second = await registry.loadLawPack('XK');

  assert.equal(first, second);
  assert.equal(first.countryCode, 'XK');
  assert.equal(xkLoads, 1);
  assert.equal(mkLoads, 0);
});

test('default recovery law-pack registry validates static country packs lazily', async () => {
  clearLawPackCacheForTests();

  const mk = await loadLawPack('mk');

  assert.equal(mk.countryCode, 'MK');
  assert.equal(mk.recoveryLaw, 'MK');
  assert.equal(mk.recoveryLegalTenantId, 'tenant_mk');
  assert.equal(mk.regulatedActivityNoteRequired, true);
});

test('unsupported law-pack country never falls back to tenant or host context', async () => {
  const registry = createLawPackRegistry({
    MK: () => {
      throw new Error('membership legal tenant fallback must not load MK');
    },
  });

  await assert.rejects(
    registry.loadLawPack('CH'),
    error =>
      error instanceof UnsupportedLawPackCountryError &&
      error.code === 'unsupported_law_pack_country' &&
      error.countryCode === 'CH'
  );
});

test('law-pack schema rejects malformed pack data before returning it', async () => {
  const registry = createLawPackRegistry({
    XK: () => ({
      countryCode: 'XK',
      recoveryLaw: 'Kosovo',
      recoveryLegalTenantId: '',
      regulatedActivityNoteRequired: true,
      owner: 'domain-recovery-test',
      effectiveFrom: '2026-06-13',
      lastReviewed: '2026-06-13',
      sourceReferences: ['test:invalid'],
    }),
  });

  await assert.rejects(
    registry.loadLawPack('XK'),
    error => error instanceof InvalidLawPackError && error.code === 'invalid_law_pack'
  );
});
