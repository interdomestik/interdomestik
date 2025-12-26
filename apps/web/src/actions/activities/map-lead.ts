export function mapLeadActivitiesToFeedRows(activities: any[]) {
  return activities.map(a => ({
    id: a.id,
    memberId: a.leadId,
    agentId: a.agentId,
    type: a.type,
    subject: a.summary,
    description: a.description,
    occurredAt: a.occurredAt,
    createdAt: a.createdAt,
    updatedAt: a.createdAt,
    agent: a.agent,
  }));
}
