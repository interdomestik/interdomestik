// Reviewed C1 admission for the SEC-11 trusted-host bundle (see c1-admissions.mjs for the
// all-or-nothing semantics). WP-01 PR C (SEC-11): owner decisions 2026-11-18 on the per-environment
// host lists, and the owner's 2026-11-18 go-ahead to finish WP-01 ("do what needs to be done").
const AUTH = 'apps/web/src/lib/auth';

export const SEC11_TRUSTED_HOSTS = {
  id: 'sec11-trusted-hosts-2026-11',
  reason:
    'Reviewed host lists: a hosted deployment trusts only the exact sign-in hosts of its own ' +
    'environment for auth origins and the auth base URL, and refuses to configure auth when the ' +
    'trusted-origins variable names any other origin. The auth instance, identity storage on ' +
    'the admin connection, session tenant resolution, request authority and tenant transactions ' +
    'are unchanged.',
  files: [
    {
      file: `${AUTH}/deployment-hosts.ts`,
      sha256: 'b49a1e48062f375433c7e8993c3590fe6d8b32b87bd9499d9a143ebb417f856c',
      units: [
        'PRODUCTION_AUTH_HOSTS',
        'STAGING_AUTH_HOSTS',
        'isHostedDeployment',
        'hostedAuthEnvironment',
        'hostedAuthHosts',
        'httpsOriginOnList',
        'hostedAuthOrigin',
        'filterHostedOrigins',
      ],
    },
    {
      file: `${AUTH}/utils.ts`,
      sha256: '8ff1df7ddab112bfd9212320e875836d5efc151bbb015a50005d97bee7e77aa6',
      units: ['withoutTrailingSlashes', 'getTrustedOrigins', 'getAuthBaseURL'],
    },
  ],
  sinkEdges: [],
};
