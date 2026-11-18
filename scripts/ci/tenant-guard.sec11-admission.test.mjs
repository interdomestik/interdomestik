import assert from 'node:assert/strict';
import test from 'node:test';
import { C1_ADMISSIONS } from './tenant-guard/c1-admissions.mjs';

// The SEC-11 trusted-host admission must stay registered with exactly its reviewed units, or the
// guard refuses the auth callers again; it must never grow a sink edge.

const byCodeUnit = (a, b) => Number(a > b) - Number(a < b);

test('the SEC-11 trusted-host admission stays registered with its exact units and no edges', () => {
  const admission = C1_ADMISSIONS.find(entry => entry.id === 'sec11-trusted-hosts-2026-11');
  assert.ok(admission, 'SEC-11 admission is registered');
  const hosts = 'apps/web/src/lib/auth/deployment-hosts.ts';
  const utils = 'apps/web/src/lib/auth/utils.ts';
  const units = admission.files.flatMap(entry => entry.units.map(unit => `${entry.file}#${unit}`));
  assert.deepEqual(units.sort(byCodeUnit), [
    `${hosts}#PRODUCTION_AUTH_HOSTS`,
    `${hosts}#STAGING_AUTH_HOSTS`,
    `${hosts}#filterHostedOrigins`,
    `${hosts}#hostedAuthEnvironment`,
    `${hosts}#hostedAuthHosts`,
    `${hosts}#hostedAuthOrigin`,
    `${hosts}#httpsOriginOnList`,
    `${hosts}#isHostedDeployment`,
    `${utils}#getAuthBaseURL`,
    `${utils}#getTrustedOrigins`,
    `${utils}#withoutTrailingSlashes`,
  ]);
  assert.deepEqual(admission.sinkEdges, []);
});
