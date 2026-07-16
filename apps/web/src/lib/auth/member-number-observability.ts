import * as Sentry from '@sentry/nextjs';

export type MemberNumberLifecycleEvent =
  | 'user_create_after_assigned'
  | 'user_create_after_failed'
  | 'self_heal_invoked'
  | 'self_heal_resolved'
  | 'self_heal_failed';

export type MemberNumberLifecycleContext = {
  createdYear?: number;
  isNew?: boolean;
};

export function captureMemberNumberLifecycleEvent(
  event: MemberNumberLifecycleEvent,
  context: MemberNumberLifecycleContext = {}
): void {
  const failed = event.endsWith('failed');
  const outcome = failed ? 'failure' : event === 'self_heal_invoked' ? 'started' : 'success';
  const safeContext: MemberNumberLifecycleContext = {};
  if (typeof context.createdYear === 'number') safeContext.createdYear = context.createdYear;
  if (typeof context.isNew === 'boolean') safeContext.isNew = context.isNew;

  Sentry.captureMessage(`member-number.${event}`, {
    level: failed ? 'error' : 'info',
    tags: {
      component: 'auth.databaseHooks',
      domain: 'member-number',
      event,
      outcome,
    },
    extra: safeContext,
  });
}
