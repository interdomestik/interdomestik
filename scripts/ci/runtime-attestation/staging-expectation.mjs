// U2-e reviewed staging expectation. Changing it is a reviewed change: the receipt records its
// digest. `backendMarker` stays null until an owner-approved migration enrols the marker.
export const STAGING_EXPECTATION = Object.freeze({
  schemaVersion: 'ida.u2e-staging-expectation.v1',
  environment: 'staging',
  loginRole: 'interdomestik_runtime_rls',
  allowedReachableRoles: Object.freeze([]),
  backendMarker: null,
});
