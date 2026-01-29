import { LandingDecisionDTO } from '@/core-contracts';

/**
 * Pure core decision logic for the locale landing page.
 * Currently just renders, but ready for auth-based redirects.
 */
export function getLocaleLandingCore(_params: {
  locale: string;
  session: { userId?: string; role?: string } | null;
}): LandingDecisionDTO {
  if (_params.session?.userId) {
    // V3: All users (including Agents) land on the Member dashboard for a unified experience.
    // Agents can switch to professional tools via the sidebar.
    return { kind: 'redirect', destination: `/${_params.locale}/member` };
  }

  return { kind: 'render' };
}
