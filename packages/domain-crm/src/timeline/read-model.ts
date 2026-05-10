import type { CrmActorContext } from '../context';
import type { SupportHandoffRepository } from '../support-handoffs/repository';

export type CrmTimelineItemKind =
  | 'support_handoff_created'
  | 'support_handoff_staff_response'
  | 'support_handoff_member_acknowledgement'
  | 'support_handoff_member_reply'
  | 'support_handoff_staff_follow_up';

export type CrmTimelineItem = {
  id: string;
  aggregateId: string;
  aggregateType: 'support_handoff';
  kind: CrmTimelineItemKind;
  occurredAt: string;
  actorId: string | null;
  metadata: Record<string, unknown>;
};

export type CrmTimelineReadModelSources = {
  supportHandoffs: Pick<SupportHandoffRepository, 'findById'>;
};

export type GetSupportHandoffTimelineInput = {
  actor: CrmActorContext;
  handoffId: string;
};

// Architectural invariant: CRM activity/timeline is a read-only derived projection.
// Domain writes must not write timeline rows directly. Timeline/read-model code may
// read aggregate repositories; aggregate modules must not import from timeline.
export interface CrmTimelineReadModel {
  listSupportHandoffTimeline(
    input: GetSupportHandoffTimelineInput,
    sources: CrmTimelineReadModelSources
  ): Promise<CrmTimelineItem[]>;
}
