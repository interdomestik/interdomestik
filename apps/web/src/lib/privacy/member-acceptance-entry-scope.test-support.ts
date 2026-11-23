export const web = 'apps/web/src/';
export const member = 'app/[locale]/(app)/member/';
export const cashResubmission =
  'features/admin/verification/actions/verification.ts#resubmitCashAttemptAction';

export const protectedLoaderIds = [
  `${member}(portal)/portal-context.ts#getMemberPortalContext`,
  `${member}claims/[id]/_core.ts#getMemberClaimDetailsCore`,
  `${member}claims/new-case-entry.server.ts#resolveMemberNewCaseEntry`,
  `${member}help/_advisory-banner.tsx#AdvisoryBanner`,
  `${member}help/_member-claim-options.ts#getMemberClaimOptions`,
  `${member}help/_public-response-banner.tsx#PublicResponseBanner`,
  `${member}membership/_core.ts#getMemberDocumentsCore`,
  `${member}membership/_core.ts#getMemberLeavableSponsorEntryCore`,
  `${member}membership/_core.ts#getMemberSubscriptionsCore`,
  `${member}policies/_core.ts#getPoliciesWithDocumentLinksCore`,
  'components/dashboard/member-dashboard-view/index.tsx#getDashboardSupplementalData',
  'features/claims/tracking/server/getMemberClaimDetail.ts#getMemberClaimDetail',
  'features/claims/tracking/server/member-domain-event-timeline.ts#getMemberTimelineFromDomainEvents',
  'features/claims/tracking/server/getMemberVaultConsentDisplay.ts#getMemberVaultConsentDisplay',
  'features/member/policies/components/MemberPoliciesV2Page.tsx#MemberPoliciesV2Page',
];

export const deferredUnits = [
  'app/api/documents/[id]/route.ts#GET',
  'app/api/documents/[id]/download/route.ts#GET',
  'app/api/documents/cross-tenant-document-lookup.ts#lookupCrossGrantDoc',
  'app/api/documents/durable-case-grants.ts#findActorCrossGrantContexts',
  'app/api/documents/durable-case-grants.ts#hasDurableCaseScopedDocumentGrant',
  'actions/notifications.core.ts#markAsRead',
  'actions/notifications.core.ts#markAllAsRead',
  'actions/notifications.ts#markAsRead',
  'actions/notifications.ts#markAllAsRead',
] as const;
export const deferredReason =
  'before accepting, a member can still reach, by direct link, the documents the existing access rules already allow them (own claims and case grants), plus their own notification flags';

export const sessionNames = new Set([
  'authorizeSessionTenant',
  'authorizeSessionUserTenant',
  'getSessionSafe',
  'getCachedSession',
  'getSession',
  'requireSessionOrRedirect',
  'mintTenantAuthority',
  'withTenantContext',
  'withTenantDb',
  'db',
]);
export const sessionModules = new Set([
  `${web}lib/auth.server.ts`,
  `${web}lib/auth/index.ts`,
  `${web}components/shell/session.ts`,
  `${web}lib/tenant-authority.server.ts`,
]);
