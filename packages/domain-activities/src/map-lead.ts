export function mapLeadActivitiesToFeedRows(activities: any[]) {
  return activities.map(a => ({
    id: a.id,
    tenantId: a.tenantId,
    leadId: a.leadId,
    memberId: a.leadId,
    agentId: a.agentId,
    type: a.type,
    subject: a.summary,
    description: a.description ?? null,
    occurredAt: a.occurredAt ?? a.createdAt,
    scheduledAt: a.scheduledAt,
    completedAt: a.completedAt,
    createdAt: a.createdAt,
    updatedAt: a.createdAt,
    agent: a.agent,
  }));
}
