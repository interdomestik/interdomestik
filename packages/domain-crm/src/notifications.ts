import type { CrmActorContext } from './context';
import type { SupportHandoff, SupportHandoffCrmState } from './support-handoffs/types';

export type CrmNotificationKind =
  | 'support_handoff_staff_response'
  | 'support_handoff_member_acknowledgement'
  | 'support_handoff_member_reply'
  | 'support_handoff_staff_follow_up';

export type CrmSupportHandoffNotification = {
  actor: CrmActorContext;
  handoff: SupportHandoff;
  kind: CrmNotificationKind;
  previousState?: SupportHandoffCrmState;
  nextState: SupportHandoffCrmState;
};

export type CrmNotificationResult = {
  queued: boolean;
};

export interface CrmNotificationPort {
  notifySupportHandoff(params: CrmSupportHandoffNotification): Promise<CrmNotificationResult>;
}
