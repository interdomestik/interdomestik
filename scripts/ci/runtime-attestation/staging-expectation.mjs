// U2-e reviewed staging expectation. Changing it is a reviewed change: the receipt records its
// digest. `backendMarker` is the staging backend identity label that the owner-approved staging
// enrolment (enrol-staging.mjs) provisions; it is a public label, not a credential.
export const STAGING_EXPECTATION = Object.freeze({
  schemaVersion: 'ida.u2e-staging-expectation.v1',
  environment: 'staging',
  loginRole: 'interdomestik_runtime_rls',
  allowedReachableRoles: Object.freeze([]),
  backendMarker: 'ida.staging.backend-marker.v1:d7295845-00f1-4cfb-a578-54d0891f06ee',
});
