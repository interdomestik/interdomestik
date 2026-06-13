export type WebhookUserRecord = {
  agentId?: string | null;
  email?: string | null;
  name?: string | null;
  memberNumber?: string | null;
};

export type NewMembershipOwnershipSource = 'user.agentId' | 'checkout.customData.agentId';

function normalizeAgentId(agentId: string | null | undefined): string | null {
  if (typeof agentId !== 'string') return null;
  const normalized = agentId.trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolveNewMembershipOwnership(args: {
  userRecord?: WebhookUserRecord | null;
  customData?: { agentId?: string };
}) {
  if (args.userRecord && 'agentId' in args.userRecord) {
    const agentId = normalizeAgentId(args.userRecord.agentId);
    return {
      agentId,
      resolvedFrom: agentId ? ('user.agentId' as const) : null,
    };
  }

  const agentId = normalizeAgentId(args.customData?.agentId);
  return {
    agentId,
    resolvedFrom: agentId ? ('checkout.customData.agentId' as const) : null,
  };
}

export function toOwnershipResolvedFrom(
  source: NewMembershipOwnershipSource | null
): NewMembershipOwnershipSource[] {
  return source ? [source] : [];
}
