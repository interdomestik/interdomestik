import {
  assertNoUnexpectedPayloadFields,
  assertStringSetPayloadField,
} from './domain-event-payload-helpers';

const MEMBERSHIP_AGENT_CLIENT_BOUND_KEYS = new Set(['bindingStatus', 'ownershipSource']);
const MEMBERSHIP_AGENT_CLIENT_BINDING_STATUSES = new Set(['active']);
const MEMBERSHIP_OWNERSHIP_SOURCES = new Set(['user.agentId', 'checkout.customData.agentId']);

export function membershipAgentClientBoundPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  assertNoUnexpectedPayloadFields(
    payload,
    'membership.agent_client_bound',
    MEMBERSHIP_AGENT_CLIENT_BOUND_KEYS
  );

  return {
    bindingStatus: assertStringSetPayloadField(
      payload,
      'bindingStatus',
      MEMBERSHIP_AGENT_CLIENT_BINDING_STATUSES,
      'an agent-client binding status'
    ),
    ownershipSource: assertStringSetPayloadField(
      payload,
      'ownershipSource',
      MEMBERSHIP_OWNERSHIP_SOURCES,
      'a membership ownership source'
    ),
  };
}
