import type { ClaimStatus } from '@interdomestik/database/constants';

type Status = {
  kind: 'claim_status_changed';
  claimId: string;
  lifecycleVersion: number;
  facts: {
    fromStatus: ClaimStatus;
    toStatus: ClaimStatus;
  };
};
type Message = {
  kind: 'claim_message_to_member';
  messageId: string;
  facts: {
    previewRestricted: boolean;
  };
};
type Staff =
  | { kind: 'staff_claim_submitted'; claimId: string; recipientUserId: string }
  | { kind: 'staff_member_message'; messageId: string; recipientUserId: string };
type Source =
  | Status
  | Message
  | Staff
  | { kind: 'claim_submitted'; claimId: string }
  | {
      kind: 'claim_recovery_decision';
      decisionDomainEventId: string;
      facts: {
        decision: 'accepted' | 'declined';
      };
    };
type Channel = { channel: 'in_app' | 'email' } | { channel: 'push'; pushSubscriptionId: string };

export type EnqueueDelivery = {
  id: string;
  tenantId: string;
  claimId: string;
  recipientUserId: string;
} & (
  | (Source & { channel: 'email' })
  | ((Status | Message) & { channel: 'push'; pushSubscriptionId: string })
);

export function notificationDeliveryKey(input: Source & Channel): string {
  const suffix = input.channel === 'push' ? `push:${input.pushSubscriptionId}` : input.channel;
  switch (input.kind) {
    case 'claim_submitted':
      return `claim-submitted:${input.claimId}:${suffix}`;
    case 'claim_status_changed':
      return `claim-status:${input.claimId}:${input.lifecycleVersion}:${suffix}`;
    case 'claim_recovery_decision':
      return `claim-recovery-decision:${input.decisionDomainEventId}:${suffix}`;
    case 'claim_message_to_member':
      return `claim-message:${input.messageId}:${suffix}`;
    case 'staff_claim_submitted':
      return `staff:${input.kind}:${input.claimId}:${input.recipientUserId}:${suffix}`;
    case 'staff_member_message':
      return `staff:${input.kind}:${input.messageId}:${input.recipientUserId}:${suffix}`;
  }
}
