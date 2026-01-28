import { LandingDecisionDTO } from '@/core-contracts';

/**
 * Pure core decision logic for the locale landing page.
 * Currently just renders, but ready for auth-based redirects.
 */
export function getLocaleLandingCore(_params: {
  locale: string;
  session: { userId?: string } | null;
}): LandingDecisionDTO {
  if (_params.session?.userId) {
    return { kind: 'redirect', destination: `/${_params.locale}/member` };
  }

  return { kind: 'render' };
}
