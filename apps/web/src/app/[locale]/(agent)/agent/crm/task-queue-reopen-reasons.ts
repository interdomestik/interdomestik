import type { CrmTaskReopenReasonCode } from '@interdomestik/domain-crm/tasks';

export const AGENT_CRM_TASK_QUEUE_REOPEN_REASON_CODES = [
  'follow_up_required',
  'incomplete',
  'manually_reopened',
] as const satisfies readonly CrmTaskReopenReasonCode[];

export type AgentCrmTaskQueueReopenReasonCode =
  (typeof AGENT_CRM_TASK_QUEUE_REOPEN_REASON_CODES)[number];

export function isAgentCrmTaskQueueReopenReasonCode(
  value: unknown
): value is AgentCrmTaskQueueReopenReasonCode {
  return (
    typeof value === 'string' &&
    (AGENT_CRM_TASK_QUEUE_REOPEN_REASON_CODES as readonly string[]).includes(value)
  );
}
