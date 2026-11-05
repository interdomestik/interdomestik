// The privileged symbols of the tenant guard boundary (see manifest.mjs). Part of the owner-pinned
// guard source.

export const DB = 'packages/database/src';

/**
 * Privileged capabilities: referenced only as a direct call (or, for clients, a direct member
 * call) from the listed files. Every alias, value use, storage, callback, computed access or
 * re-export outside `reexports` blocks.
 */
export const PRIVILEGED = new Map([
  [
    `${DB}/db.ts#dbAdmin`,
    {
      form: 'member',
      callers: [
        `${DB}/tenant.ts`,
        `${DB}/migrate.ts`,
        `${DB}/rls-role-assertion.ts`,
        `${DB}/scheduled-tenant-work.ts`,
        `${DB}/public-token-tenant.ts`,
        `${DB}/platform-directory.ts`,
        `${DB}/tenant-directory.ts`,
        `${DB}/paddle-provider-resolution.ts`,
        `${DB}/paddle-webhook-receipts.ts`,
        `${DB}/anonymous-tenant-audit.ts`,
        `${DB}/case-grant-document-audit.ts`,
        `${DB}/tenant-member-credential.ts`,
        `${DB}/tenant-member-number.ts`,
        `${DB}/public-site-tenant.ts`,
        `${DB}/claim-home-tenant.ts`,
        // better-auth's adapter and the pre-tenant auth hooks run before any tenant exists.
        'apps/web/src/lib/auth/schema.ts',
        'apps/web/src/lib/auth/tenant-lookup.ts',
        'apps/web/src/lib/auth/member-number-user-create-hook.ts',
        'apps/web/src/lib/auth/member-number-session-hook.ts',
        'apps/web/src/lib/auth/different-email-recovery-store.ts',
        'apps/web/src/server/auth/effective-portal-access.ts',
      ],
      reexports: [`${DB}/index.ts`],
    },
  ],
  [
    `${DB}/db.ts#dbRls`,
    {
      form: 'member',
      // U2-e: the read-only, catalogue-only observation of the deployed tenant client's authority.
      callers: [`${DB}/tenant.ts`, `${DB}/runtime-authority-observation.ts`],
      reexports: [`${DB}/index.ts`],
    },
  ],
  [
    `${DB}/tenant-authority.ts#mintTenantAuthority`,
    {
      form: 'call',
      callers: [
        `${DB}/scheduled-tenant-work.ts`,
        `${DB}/public-token-tenant.ts`,
        `${DB}/public-site-tenant.ts`,
        `${DB}/claim-home-tenant.ts`,
        `${DB}/platform-directory.ts`,
        `${DB}/paddle-tenant-authority.ts`,
        `${DB}/testing/tenant-authority.ts`,
        'apps/web/src/lib/tenant-authority.server.ts',
      ],
      reexports: [`${DB}/tenant-authority-registrar.ts`],
    },
  ],
  [
    `${DB}/ingress-capability.ts#mintIngressCapability`,
    {
      form: 'call',
      callers: [
        `${DB}/ingress-capability.ts`,
        'apps/web/src/lib/inngest/functions.ts',
        'packages/domain-membership-billing/src/paddle-webhooks/verify.ts',
      ],
      reexports: [`${DB}/ingress-registrar.ts`],
    },
  ],
  [
    `${DB}/ingress-capability.ts#requireIngressCapability`,
    {
      form: 'call',
      callers: [`${DB}/scheduled-tenant-work.ts`, `${DB}/paddle-tenant-authority.ts`],
      reexports: [],
    },
  ],
  [
    `${DB}/ingress-capability.ts#requirePaddleDeliveryBillingTenant`,
    { form: 'call', callers: [`${DB}/paddle-tenant-authority.ts`], reexports: [] },
  ],
  [
    `${DB}/anonymous-tenant-audit.ts#appendAnonymousTenantAuditEvent`,
    {
      form: 'call',
      callers: ['apps/web/src/app/api/auth/[...all]/route.ts'],
      reexports: [`${DB}/index.ts`],
    },
  ],
  [
    // A case-grant document read is audited in the case's home tenant by one fixed append, only
    // after the reader's own active grant for that case is confirmed.
    `${DB}/case-grant-document-audit.ts#appendCaseGrantDocumentAudit`,
    {
      form: 'call',
      callers: ['apps/web/src/app/api/documents/_core.ts'],
      reexports: [`${DB}/index.ts`],
    },
  ],
  [
    // An agent-registered member's first credential is attached by one fixed identity append, only
    // for a member that agent created in the authority's tenant and that has no account yet.
    `${DB}/tenant-member-credential.ts#appendTenantMemberCredential`,
    {
      form: 'call',
      callers: ['apps/web/src/lib/actions/agent/register-member.core.ts'],
      reexports: [`${DB}/index.ts`],
    },
  ],
  [
    // Whether a user of the authority's tenant has a password credential, and nothing else:
    // billing onboarding, and an agent registration resolving an append whose outcome was lost.
    `${DB}/tenant-member-credential.ts#hasTenantMemberCredential`,
    {
      form: 'call',
      callers: [
        'apps/web/src/lib/actions/agent/register-member.core.ts',
        'packages/domain-membership-billing/src/paddle-webhooks/handlers/utils/reconcile-checkout-user.ts',
      ],
      reexports: [`${DB}/index.ts`],
    },
  ],
  [
    // The global member-number sequence advances only for a committed member of the authority's
    // tenant, in one fixed transaction that both reserves and assigns the number.
    `${DB}/tenant-member-number.ts#issueTenantMemberNumber`,
    {
      form: 'call',
      callers: [
        'apps/web/src/lib/actions/agent/register-member.core.ts',
        'packages/domain-leads/src/convert.ts',
        'packages/domain-membership-billing/src/paddle-webhooks/handlers/utils/reconcile-checkout-user.ts',
      ],
      reexports: [`${DB}/index.ts`],
    },
  ],
  [
    // A transferred claim's home-tenant details are read by one fixed module, for that claim only.
    `${DB}/claim-home-tenant.ts#delegateClaimHomeTenantRead`,
    {
      form: 'call',
      callers: ['apps/web/src/features/admin/claims/server/getOpsClaimDetailHomeReads.ts'],
      reexports: [`${DB}/index.ts`],
    },
  ],
  [
    // Every anonymous public-site writer is named here and reviewed; nothing else may mint for a host tenant.
    `${DB}/public-site-tenant.ts#authorizePublicSiteTenant`,
    {
      form: 'call',
      callers: [
        'apps/web/src/actions/leads.core.ts',
        'apps/web/src/lib/actions/business-membership-lead.ts',
        'apps/web/src/actions/free-start/submit.core.ts',
      ],
      reexports: [`${DB}/index.ts`],
    },
  ],
  [
    // The pack id is only a claim of the share token; only the service that verifies its signature may resolve it.
    `${DB}/public-token-tenant.ts#resolveSharePackTenant`,
    {
      form: 'call',
      callers: ['apps/web/src/features/share-pack/share-pack.service.ts'],
      reexports: [`${DB}/index.ts`],
    },
  ],
  [
    `${DB}/paddle-tenant-authority.ts#registerResolvedPaddleOwner`,
    { form: 'call', callers: [`${DB}/paddle-provider-resolution.ts`], reexports: [] },
  ],
  [
    `${DB}/testing/tenant-authority.ts#mintTestTenantAuthority`,
    { form: 'call', callers: [], reexports: [] },
  ],
]);
