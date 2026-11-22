// Reviewed C1 admission for the session-read failure change (see c1-admissions.mjs for the
// all-or-nothing semantics). Owner R-37 authorization and approval of this unit list, 2026-11-21
// ("Po, autorizoj"); design approved by independent review, design round 4; code head 97468bb8c.
const WEB = 'apps/web/src';

export const SESSION_READ_FAILURE = {
  id: 'session-read-failure-2026-11',
  reason:
    'Reviewed session readers: Next control flow propagates, a clean absence stays null, and an ' +
    'operational session-read failure rejects with a typed error instead of becoming anonymous. ' +
    'Admin overview keeps its session-derived tenant and one credential-bearing retry through the ' +
    'request-scoped reader. Tenant authority minting, shell cache state and denials are unchanged.',
  files: [
    {
      file: `${WEB}/lib/auth.server.ts`,
      sha256: '7c070775bfbfd44cdc19a05832e2a2532905c5c550d367cbfaa0d16f033a3ea3',
      units: ['resolveSessionInner'],
    },
    {
      file: `${WEB}/lib/session-read.server.ts`,
      sha256: 'b72ba8f5b4b2262eeca54afd3d33e98f95f8e38b5b4bf5e1b84483737445f206',
      units: [
        'SESSION_READ_FAILED',
        'isSessionReadFailure',
        'throwSessionReadFailure',
        'hasSessionHint',
        'fetchSessionOnce',
        'fetchSessionWithRetry',
      ],
    },
    {
      file: `${WEB}/app/[locale]/admin/overview/page.tsx`,
      sha256: 'd6a26a431e1ef1cc9e7f949cd49a0d601d2f036cac09b5faff888abcc35a285b',
      units: ['AdminOverviewPage'],
    },
  ],
  sinkEdges: [
    {
      file: `${WEB}/app/[locale]/admin/overview/page.tsx`,
      unit: 'AdminOverviewPage',
      sink: `${WEB}/features/admin/overview/server/get-admin-overview-data.ts#getAdminOverviewData`,
    },
  ],
};
