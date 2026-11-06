// U2-e staging authority: the only database the staging enrolment may mutate. Every field is an
// independently reviewed fact about the staging project, never derived from the secret URLs the run
// receives. Until `reviewed` is true with every field set, enrolment refuses before connecting.
// Changing this file is a reviewed change; the enrolment receipt records its digest.
export const STAGING_AUTHORITY = Object.freeze({
  schemaVersion: 'ida.u2e-staging-authority.v1',
  reviewed: false,
  // Staging Supabase project (owner/Codex packet 170); production is a different project.
  projectRef: 'xjyseqtfuxcuviiankhy',
  // Exact connection endpoint and routing usernames of both staging secrets.
  host: null,
  port: null,
  database: null,
  adminUser: null,
  adminRole: null,
  runtimeUser: null,
  // PEM trust anchor for certificate and hostname verification.
  caPem: null,
  // `public.user` id that exists only in the staging database (the U2-e observer account).
  identityProbeUserId: null,
});
