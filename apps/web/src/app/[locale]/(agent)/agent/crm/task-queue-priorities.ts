export const AGENT_CRM_TASK_QUEUE_PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const;

export type AgentCrmTaskQueuePriority = (typeof AGENT_CRM_TASK_QUEUE_PRIORITIES)[number];

export function isAgentCrmTaskQueuePriority(value: unknown): value is AgentCrmTaskQueuePriority {
  return AGENT_CRM_TASK_QUEUE_PRIORITIES.some(priority => priority === value);
}
