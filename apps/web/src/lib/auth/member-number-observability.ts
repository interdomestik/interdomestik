import * as Sentry from '@sentry/nextjs';

export type MemberNumberLifecycleEvent =
  | 'user_create_after_assigned'
  | 'user_create_after_failed'
  | 'self_heal_invoked'
  | 'self_heal_resolved'
  | 'self_heal_failed';

export type MemberNumberLifecycleContext = Record<string, unknown> & {
  userId: string;
  tenantId?: string | null;
  email?: string | null;
  memberNumber?: string | null;
  createdYear?: number;
  isNew?: boolean;
  errorMessage?: string;
};

export function captureMemberNumberLifecycleEvent(
  event: MemberNumberLifecycleEvent,
  context: MemberNumberLifecycleContext
) {
  const level = event.endsWith('failed') ? 'error' : 'info';

  Sentry.captureMessage(`member-number.${event}`, {
    level,
    tags: {
      component: 'auth.databaseHooks',
      domain: 'member-number',
      event,
    },
    extra: context,
  });
}
