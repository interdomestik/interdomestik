import type { SponsorStaffTask } from '@interdomestik/domain-membership-billing/sponsors/staff-tasks';

export const TASK_KINDS = [
  'intent_review',
  'observed_cancel',
  'scheduled_cancel',
  'charge',
  'entry_review',
  'rejected_entry',
  'checkout_race',
  'unactivated_account',
] as const;

export function groupSponsorTasks(
  tasks: readonly SponsorStaffTask[]
): { kind: SponsorStaffTask['kind']; tasks: SponsorStaffTask[] }[] {
  return TASK_KINDS.map(kind => ({ kind, tasks: tasks.filter(task => task.kind === kind) })).filter(
    group => group.tasks.length > 0
  );
}

export function entryReason(
  reason: string | null
): 'paddle_state' | 'empty_interval' | 'binding' | 'unknown' {
  return reason === 'paddle_state' || reason === 'empty_interval' || reason === 'binding'
    ? reason
    : 'unknown';
}
