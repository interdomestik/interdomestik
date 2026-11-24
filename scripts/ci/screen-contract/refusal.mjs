// The refusal of the fixed configuration (the WP-05 flip, D-1), shared by the resolution pins
// (resolution.mjs), the request rules (requests.mjs) and the configuration-change refusal.
import { ScanError } from '../server-mutation/ast.mjs';

// The fixed configuration (the owner's decision B, 2026-11-23): the scanner models the build for
// one reviewed configuration and refuses every other. Each refusal names its reason and that a
// change needs a scanner PR first, which reviews the new configuration and updates the pin in resolution.mjs.
export const SCANNER_PR =
  'a change to it needs a scanner PR first (WP-05 flip, D-1 fixed configuration)';
// The refusal text is also kept as `refusal`: ESLint appends to a rule's error message in place,
// and the lint reports this text unchanged (Sol r2).
export const refuse = what => {
  const message = `${what}; ${SCANNER_PR}`;
  const error = new ScanError(message);
  error.refusal = message;
  throw error;
};
