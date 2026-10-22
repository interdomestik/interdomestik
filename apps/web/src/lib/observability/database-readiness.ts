import * as Sentry from '@sentry/nextjs';

import type { RlsRoleReadinessSnapshot } from '@interdomestik/database/db';

const REASONS = [
  'invalid_configured_role',
  'missing_role_posture',
  'role_bypasses_rls',
  'query_failed',
] as const;

/** Optional observation of finalized state; never receives clients, errors or admission callbacks. */
export async function reportDatabaseReadiness(snapshot: RlsRoleReadinessSnapshot): Promise<void> {
  try {
    const phase = snapshot.phase;
    if (phase !== 'ready' && phase !== 'failed') return;
    const candidateReason = snapshot.reason;
    const candidateRole = snapshot.checkedRole;
    const data = Object.freeze({
      phase,
      reason: candidateReason && REASONS.includes(candidateReason) ? candidateReason : undefined,
      checkedRole:
        candidateRole === 'connection' || candidateRole === 'configuredDbRole'
          ? candidateRole
          : undefined,
      timedOut: snapshot.timedOut === true,
    });
    const message = `database.rls.readiness.${phase}`;
    const level = phase === 'ready' ? 'info' : 'error';
    await Promise.resolve(Sentry.addBreadcrumb({ category: 'database.rls', level, message, data }));
    await Promise.resolve(
      Sentry.captureMessage(message, {
        level,
        tags: { component: 'database', check: 'rls' },
        extra: data,
      })
    );
  } catch {
    console.warn('Optional database readiness reporting failed.');
  }
}
