// Reviewed C1 admission for the ACQ-2c credential-hardening auth bundle (see c1-admissions.mjs for
// the all-or-nothing semantics). Plan070 standing approval 2026-11-04 with Codex; owner directive
// 2026-11-07 (chat): "vazhdo implementimin deri ne perfundim te s8 ne bashkpunim me codex".
const AUTH = 'apps/web/src/lib/auth';

export const ACQ2C_CREDENTIAL_HARDENING = {
  id: 'acq2c-credential-hardening-2026-11',
  reason:
    'Reviewed credential hardening: Better Auth revokes every session of a user on a completed ' +
    'reset, mails a reset link only to the current canonical mailbox, and a plugin after hook ' +
    'marks that mailbox verified once a reset completes. The auth instance, identity storage on ' +
    'the admin connection, session tenant resolution, request authority and tenant transactions ' +
    'are unchanged.',
  files: [
    {
      file: `${AUTH}/providers.ts`,
      sha256: '6709117e6f332980bbf15ac7683b7844b459cd09dfead47a7041e04cd1b98e84',
      units: ['buildAuthProviders'],
    },
    {
      file: `${AUTH}/reset-completion.ts`,
      sha256: 'cde5ea0cc558915d41eaf117c63b3ff3dbbde715b369ee899ac98474c0a6a305',
      units: ['resetCompletionPlugin'],
    },
  ],
  sinkEdges: [],
};
