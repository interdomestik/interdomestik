import {
  assertBooleanPayloadField,
  assertNoUnexpectedPayloadFields,
  assertStringSetPayloadField,
} from './domain-event-payload-helpers';

const MEMBERSHIP_ATTRIBUTION_RECORDED_KEYS = new Set(['ownershipSource', 'readScopeGranted']);
const MEMBERSHIP_AGENT_CLIENT_BOUND_KEYS = new Set(['bindingStatus', 'ownershipSource']);
const MEMBERSHIP_SUBSCRIPTION_CHANGED_KEYS = new Set([
  'cancelAtPeriodEnd',
  'fromStatus',
  'toStatus',
]);
const MEMBERSHIP_AGENT_CLIENT_BINDING_STATUSES = new Set(['active']);
const MEMBERSHIP_OWNERSHIP_SOURCES = new Set(['user.agentId', 'checkout.customData.agentId']);
const MEMBERSHIP_SUBSCRIPTION_STATUSES = new Set([
  'none',
  'active',
  'past_due',
  'paused',
  'canceled',
  'trialing',
  'expired',
]);

export function membershipAttributionRecordedPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  assertNoUnexpectedPayloadFields(
    payload,
    'membership.agent_attribution_recorded',
    MEMBERSHIP_ATTRIBUTION_RECORDED_KEYS
  );

  return {
    ownershipSource: assertStringSetPayloadField(
      payload,
      'ownershipSource',
      MEMBERSHIP_OWNERSHIP_SOURCES,
      'a membership ownership source'
    ),
    readScopeGranted: assertBooleanPayloadField(payload, 'readScopeGranted'),
  };
}

export function legacyMembershipAgentClientBoundPayload(
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

export function membershipSubscriptionChangedPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  assertNoUnexpectedPayloadFields(
    payload,
    'membership.subscription_changed',
    MEMBERSHIP_SUBSCRIPTION_CHANGED_KEYS
  );

  return {
    cancelAtPeriodEnd: assertBooleanPayloadField(payload, 'cancelAtPeriodEnd'),
    fromStatus: assertStringSetPayloadField(
      payload,
      'fromStatus',
      MEMBERSHIP_SUBSCRIPTION_STATUSES,
      'a membership subscription status'
    ),
    toStatus: assertStringSetPayloadField(
      payload,
      'toStatus',
      MEMBERSHIP_SUBSCRIPTION_STATUSES,
      'a membership subscription status'
    ),
  };
}
