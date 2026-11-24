// WP-10 U1 postimages at 0396babc9. The owner authorized R-37 items 1–6 and 18 on 2026-11-22.
const LIB = 'apps/web/src/lib';
const AUTH = `${LIB}/auth`;
const AUTH_ROUTE = 'apps/web/src/app/api/auth/[...all]';

export const WP10_CLOSED_PILOT = {
  id: 'wp10-closed-pilot-2026-11',
  reason:
    'WP-10 closed-pilot identity closures: configuration and public_intake close sign-up and ' +
    'door-code creation, door eligibility precedes the library, classification requires email ' +
    'proof, and release classification ignores CI bypasses in production. Existing session, ' +
    'tenant authority, storage and document controls continue to apply at the affected callers.',
  files: [
    {
      file: `${AUTH}/providers.ts`,
      sha256: 'ae80be54215ca2a252887961f20a6d63d15b9f32876e7c4d2b74957325bce230',
      units: ['buildAuthProviders'],
    },
    {
      // The ACQ-2c provider bundle lapses when providers.ts changes. Retain its reset hook.
      file: `${AUTH}/reset-completion.ts`,
      sha256: 'cde5ea0cc558915d41eaf117c63b3ff3dbbde715b369ee899ac98474c0a6a305',
      units: ['resetCompletionPlugin'],
    },
    {
      file: `${AUTH}/config.ts`,
      sha256: '619c9ddb0b70e7d2589c813af12ba1d773e2c4dd43a9b50b1f0c17c150de9e68',
      units: ['authConfig', 'automationRequested'],
    },
    {
      file: `${AUTH}/user-authority-assignment.ts`,
      sha256: '35037b5028f87f521a76757e11781f9f60e38a0d5898b3f62751f23474441d16',
      units: ['assignUserAuthorityBeforeCreate', 'canonicalIntent'],
    },
    {
      file: `${LIB}/runtime-environment.ts`,
      sha256: '455ebd33673cc08c10d2895f0dbb2eaa1ae9ed9f41127db53b997db589e8e6d1',
      units: ['releaseClass', 'hasPositiveProductionSignal', 'isLocalE2ERuntime'],
    },
    {
      // Carry the SEC-11 host closure forward with its updated deployment classifier.
      file: `${AUTH}/deployment-hosts.ts`,
      sha256: 'a2167e11effe1a215a149544d5295995d249a2531fbbcbc3f75dd96e4fed7099',
      units: [
        'PRODUCTION_AUTH_HOSTS',
        'STAGING_AUTH_HOSTS',
        'isHostedDeployment',
        'hostedAuthEnvironmentOf',
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
    {
      file: `${LIB}/tenant/public-admission-tenant.ts`,
      sha256: '6c0ef373ca45ef8aaa0448a45e5532bd55d10c52b3ad003035c9d920ec992bf0',
      units: [
        'localIngress',
        'stagingIngress',
        'resolvePublicAdmission',
        'resolvePublicAdmissionTenant',
      ],
    },
    {
      file: `${LIB}/tenant/public-intake-admission.ts`,
      sha256: '19f7f96ec73cb00ba3b73e9d4375034a70d279fb7183e6fda4ec3f55ec5f29ac',
      units: ['authorizeOpenPublicIntake', 'readOpenSwitch', 'isPublicIntakeOpenForTenant'],
    },
    {
      file: 'packages/database/src/pilot-switch.ts',
      sha256: '817567bf6355902e2d5dc76b69bbcdc82a785cd7e56909038c576e307079e471',
      units: [
        'PILOT_SWITCH_CATEGORY',
        'PILOT_SWITCH_KEYS',
        'parsePilotSwitch',
        'pilotSwitchWhere',
        'readPilotSwitch',
      ],
    },
    {
      file: 'packages/database/src/seed-target-classification.ts',
      sha256: '6415e22fa966e69b6d48d06bda7a90b67927b88d68ca2e0b03859f5d93f66ffd',
      units: [
        'PRODUCTION_PROJECT_REF',
        'LOOPBACK_HOSTS',
        'CI_CONTAINER_HOST',
        'LITERAL_HOST',
        'TRANSPORT_QUERY_KEYS',
        'HOST_KEYS',
        'refuse',
        'decode',
        'production',
        'parse',
        'present',
        'rejectProduction',
        'literalHost',
        'hostRef',
        'userRef',
        'unique',
        'databaseTarget',
        'driverTarget',
        'assertDriverAuthority',
        'classifySeedTarget',
        'requireDisposableTargetClass',
        'driverDecodable',
        'readDisposableTargetClass',
      ],
    },
  ],
  // The claims and notification callers already pass the caller check. The document edges
  // remain bound by the existing lifetime bundles. Only the dependency closure needs admission.
  sinkEdges: [],
};

export const WP10_NEUTRAL_OTP_SESSION = {
  id: 'wp10-neutral-otp-session-2026-11',
  reason:
    "Lead option (a), 2026-11-23: the door's session protection receives only auth.api.getSession " +
    'and auth.api.revokeSession instead of the auth object; behaviour unchanged (owner R-37 items ' +
    "6 and B1, 'Yes, close it'). The two references are one call.",
  files: [
    {
      // Bind the call in handleNeutralOtpPost that passes the two session functions.
      file: `${AUTH_ROUTE}/neutral-otp-route.ts`,
      sha256: '8a201a13be4e70456da85a2a31c8d3d97b6a9c5b45fd87ce5410ee1e5b17a6ca',
      units: [],
    },
    {
      file: `${AUTH_ROUTE}/neutral-otp-session.ts`,
      sha256: '30d4c45e77543feb123e996f55e1d463506025a59b922e266e24bca6d97ec8df',
      units: ['protectNeutralOtpSession', 'revokeNewSession', 'stopDecision'],
    },
  ],
  sinkEdges: [],
};
