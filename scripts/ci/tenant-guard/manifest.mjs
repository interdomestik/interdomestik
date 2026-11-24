// The finite privileged boundary of the tenant guard (A5 S″ with the A5-r1 corrections).
//
// Symbols are named by the file that DECLARES them; the guard resolves every import, re-export and
// namespace member to its declaring file before comparing, so a subpath, alias or barrel cannot
// reach a symbol under another name. Changing this file changes what the guard admits: it is part
// of the owner-pinned guard source.

import { DB } from './privileged.mjs';

export const KERNEL = /^packages\/database\//u;

// A test source by directory or by file name: each alternative is one naming convention.
const TEST_SOURCE_FORMS = [
  String.raw`(?:^|\/)(?:__tests__|__mocks__|tests?|e2e)\/`,
  String.raw`\.(?:test|spec|e2e)\.[cm]?[jt]sx?$`,
  String.raw`(?:^|\/|[.-])test-(?:support|fixtures?|mocks?|utils|helpers?|bootstrap)\.[cm]?[jt]sx?$`,
  String.raw`\.(?:integration-)?fixtures?\.[cm]?[jt]sx?$`,
  String.raw`\.compile-fail\.[cm]?[jt]sx?$`,
];
export const TEST_SOURCE = new RegExp(`(?:${TEST_SOURCE_FORMS.join('|')})`, 'u');

/**
 * Legacy-accepting operations. Accepted only where the enclosing unit is unchanged from the
 * trusted tree and every security dependency of the operation is unchanged too (A5-r1 C1).
 * New and changed code uses withTenantAuthority, whose parameter type and runtime check demand a
 * registered TenantAuthority.
 */
export const LEGACY = new Map([
  [`${DB}/tenant.ts#withTenantContext`, 'legacy tenant context'],
  [`${DB}/tenant.ts#withTenantDb`, 'legacy tenant context'],
  [`${DB}/db.ts#db`, 'ambient database client'],
]);

/** Exact reviewed Git identity and per-entry v2 digests of its full kernel closure. */
export const KERNEL_ANCHOR = Object.freeze({
  commit: '127ebe483bc075a91aa202c915f04bd25aadf2aa',
  tree: '09035328e2fcdd0713493cee89f3ccbf8512e107',
});
export const LEGACY_PINS = new Map([
  [`${DB}/tenant.ts#withTenantContext`, 'v2:28386bc3ebe2bad1cb2d8d516ca100a3a5727da907e5c3cf4a75ba698415ab1b'],
  [`${DB}/tenant.ts#withTenantDb`, 'v2:eaee086a7379cff84171a17d3cf33004bba15a840cb021659a3cd8bb10263c26'],
  [`${DB}/db.ts#db`, 'v2:9b35f9dc83e37b59bb1e21b63e0f92e7ed4771be2c6a8e0510b622a0ad046cb2'],
]);

/**
 * Reviewed retained files whose `.query` receivers are plain data the syntactic origin check cannot
 * prove. Each is exempt from that check only at this path with these exact bytes; a changed byte,
 * an unlisted file or a malformed list refuses schema admission. Extending it needs a reviewed
 * guard source and a ruleset repin.
 */
export const NON_CLIENT_QUERY_CONSUMERS = Object.freeze([
  Object.freeze({
    path: 'apps/web/src/lib/safe-action.shape.ts',
    sha256: '472961aebe630bd1ed171ba58d488edf47dd288dc81422d60f8bacdcb9eb4cf4',
  }),
  Object.freeze({
    path: 'apps/web/src/lib/safe-route.core.ts',
    sha256: '78846d5bf2a64686cf76ad685cd0e53b563b8a5b9af579d7d0e51483a33133c8',
  }),
]);

/** Drivers and client construction (R-d). */
export const DRIVER_SPECIFIERS =
  /^(?:postgres|pg|pg-pool|drizzle-orm\/(?:postgres-js|node-postgres|pg-proxy|pglite|neon-http|neon-serverless|vercel-postgres|xata-http|aws-data-api\/pg))$/u;

// Finite seed import closure: every incoming module edge is confined by rules-seed-tls.mjs.
// Tests use TEST_SOURCE. scripts/pilot is outside the CLI's scanned roots (apps/web/src, packages),
// so pilot importers are deliberately NOT claimed as enforced members of this boundary.
export const SEED_TLS_MODULE = `${DB}/seed-target-tls.ts`;
export const SEED_TLS_CLOSURE = new Set([
  SEED_TLS_MODULE,
  `${DB}/seed-target-guard.ts`,
  `${DB}/seed.ts`,
  `${DB}/seed-assert.ts`,
  `${DB}/seed-full/index.ts`,
  `${DB}/seed-golden/index.ts`,
  `${DB}/seed-golden.ts`,
  `${DB}/seed-workload/index.ts`,
  `${DB}/seed-packs/agent-pack.ts`,
  `${DB}/seed-packs/ks-workflow-pack.ts`,
  // R-13: the guarded client for scripts that write to a disposable database (WP-04).
  `${DB}/disposable-client.ts`,
  `${DB}/scripts/rate-verification-limit.ts`,
  `${DB}/scripts/set-rate-verification-limit.ts`,
]);

export const DRIVER_MODULES = new Set([
  `${DB}/db.ts`,
  SEED_TLS_MODULE,
  `${DB}/migrate.ts`,
  `${DB}/admin-connection-config.ts`,
  `${DB}/admin-connection-preflight.ts`,
  `${DB}/migration-ledger-contracts.ts`,
  `${DB}/migration-execution-contracts.ts`,
  `${DB}/seed-utils/cleanup.ts`,
  // Seed-only closure member: opens a client only after assertDisposableTarget (R-13, WP-04).
  `${DB}/disposable-client.ts`,
  // QA MCP read tool; a separate process with its own connection string.
  'packages/qa/src/tools/db.ts',
]);

/** Connection-control SQL text (R-d): GUC, role and row security. */
export const CONNECTION_CONTROL =
  /\bset_config\b|\bset\s+(?:local\s+|session\s+)?role\b|\brow_security\b/iu;

export const CONNECTION_CONTROL_MODULES = new Set([
  `${DB}/tenant.ts`,
  `${DB}/rls-role-assertion.ts`,
  `${DB}/free-start-drafts/context.ts`,
]);

/**
 * Source-bound contracts (A5-r1 C3). Each names a unit (outermost function or top-level
 * statement) by file and name, the capability kinds it may use, and the sha256 of the unit's
 * normalized text. Any change to the unit voids the contract until it is reviewed and re-pinned.
 * Filled from the measured inventory; see contracts.mjs.
 */
export { CONTRACTS } from './contracts.mjs';
export { PRIVILEGED } from './privileged.mjs';

/**
 * State contracts (A5-r2 Q3). Changed code may call a method on module state that a retained
 * legacy tenant input reads only through a member path listed in `paths`, while the declaring
 * statement keeps the reviewed sha256 of its normalized text. `escapes` names the exact units
 * (file, name and sha256 of their normalized text) from which the state may escape as a value,
 * and the exact `consumers` units that alone may call each of them.
 */
export const STATE_CONTRACTS = [
  {
    // better-auth's session read resolves a request's own session; it writes no module state.
    key: 'apps/web/src/lib/auth/index.ts#auth',
    paths: ['api.getSession'],
    sha256: 'a9832d16cd97bce9b1c2e671ec4d9194bf642c3682bffd51b1fd03bca623b8a8',
  },
  {
    // The dynamic-host allowlist is handed to better-auth as its baseURL configuration: it
    // escapes from this reviewed function only, whose result is read only by the reviewed
    // authConfig (itself tenant state, judged at its own uses). Changed code still may not write,
    // mutate or call methods on it.
    key: 'apps/web/src/lib/auth/utils.ts#DYNAMIC_AUTH_ALLOWED_HOSTS',
    escapes: [
      {
        file: 'apps/web/src/lib/auth/utils.ts',
        unit: 'getAuthBaseURL',
        sha256: 'fb5870d962bf8f5bb3c94227b6a3f0f4ff54bd6736c692222be2523a9ced5f4b',
        consumers: [
          {
            file: 'apps/web/src/lib/auth/config.ts',
            unit: 'authConfig',
            sha256: 'b7e1f78f428aa48bc5f992e51b652240b3c4dc271d1890ef91e33a5f360266b9',
          },
        ],
      },
    ],
  },
  {
    // A const array literal in a pinned kernel module: Array.prototype reads only.
    key: `${DB}/constants.ts#CLAIM_STATUSES`,
    paths: ['filter', 'includes'],
    sha256: '82a6520078bc4e1bf2095e468389d964f09a9f958324bb711980316e9078e3b1',
  },
];
