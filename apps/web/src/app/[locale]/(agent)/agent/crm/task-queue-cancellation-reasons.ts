export const AGENT_CRM_TASK_QUEUE_CANCELLATION_REASON_CODES = [
  'not_needed',
  'duplicate',
  'created_in_error',
] as const;

export type AgentCrmTaskQueueCancellationReasonCode =
  (typeof AGENT_CRM_TASK_QUEUE_CANCELLATION_REASON_CODES)[number];

export function isAgentCrmTaskQueueCancellationReasonCode(
  value: unknown
): value is AgentCrmTaskQueueCancellationReasonCode {
  return AGENT_CRM_TASK_QUEUE_CANCELLATION_REASON_CODES.some(reason => reason === value);
}
