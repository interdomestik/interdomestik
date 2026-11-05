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

/**
 * Reviewed kernel contracts of the legacy entries: the digest over every complete workspace module
 * in the runtime import closure of each entry's module (see rules.mjs legacyDigest). A kernel change to the context,
 * transaction lifecycle or ambient client fails the guard until it is reviewed and re-pinned.
 */
export const LEGACY_PINS = new Map([
  [
    `${DB}/tenant.ts#withTenantContext`,
    Object.freeze([
      'd3f4902e4119dd3a8da409967abca96a957a3565984f3a2fa40f8e088d6ed811',
      '2333f581425f47757aa110f59f0e4b9033dede4109344fa739648cad3aeac895',
    ]),
  ],
  [
    `${DB}/tenant.ts#withTenantDb`,
    Object.freeze([
      '0d3100975724823b266d34cad449b5a2aa7185c2a88848f93e2bb22a17250978',
      '2998603bc7080c58c097f6025afb1ac6fbbc2d77bdb080f41d1a918f4d3df0c3',
    ]),
  ],
  [
    `${DB}/db.ts#db`,
    Object.freeze([
      'd8c35ada5fb6d1548911b1d8c588b00e78606065b3505daa87a25d20dacde819',
      '1cb8252650ff9453bd42e7edeb3b70c3095fbe87a23778e1a95f66d2eb0f1d66',
    ]),
  ],
]);

/** Drivers and client construction (R-d). */
export const DRIVER_SPECIFIERS =
  /^(?:postgres|pg|pg-pool|drizzle-orm\/(?:postgres-js|node-postgres|pg-proxy|pglite|neon-http|neon-serverless|vercel-postgres|xata-http|aws-data-api\/pg))$/u;

export const DRIVER_MODULES = new Set([
  `${DB}/db.ts`,
  `${DB}/migrate.ts`,
  `${DB}/admin-connection-config.ts`,
  `${DB}/admin-connection-preflight.ts`,
  `${DB}/migration-ledger-contracts.ts`,
  `${DB}/migration-execution-contracts.ts`,
  `${DB}/seed-utils/cleanup.ts`,
  // Operator scripts at the package root; never imported by runtime code (enforced below).
  'packages/database/drop-claims.ts',
  'packages/database/test-db.ts',
  'packages/database/inspect-db.ts',
  'packages/database/hotfix.ts',
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
