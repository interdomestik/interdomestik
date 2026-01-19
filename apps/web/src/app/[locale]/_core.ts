export type LocaleLandingDecision = { kind: 'render' } | { kind: 'redirect'; destination: string };

/**
 * Pure core decision logic for the locale landing page.
 * Currently just renders, but ready for auth-based redirects.
 */
export function getLocaleLandingCore(_params: {
  locale: string;
  session: { userId?: string } | null; // Typed loosely to accept AuthSession or null
}): LocaleLandingDecision {
  // Logic placeholder:
  // if (_params.session?.userId) {
  //   return { kind: 'redirect', destination: '/dashboard' };
  // }

  return { kind: 'render' };
}
