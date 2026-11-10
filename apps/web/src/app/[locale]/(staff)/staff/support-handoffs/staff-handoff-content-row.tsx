import type { getStaffSupportHandoffQueue } from '@interdomestik/domain-claims/support-handoffs/queue';
import { MessageSquareText } from 'lucide-react';
import { SupportHandoffAttentionRow } from './support-handoff-attention-row';
import { SupportHandoffClaimLink } from './support-handoff-claim-link';
import { SupportHandoffDetailPanel } from './support-handoff-detail-panel';
import { StaffHandoffContentActions } from './staff-handoff-content-actions';
import type { ContentPresentation, ContentTranslations } from './staff-handoff-content-model';

export type ContentRowProps = {
  handoff: Awaited<ReturnType<typeof getStaffSupportHandoffQueue>>[number];
  staffId: string;
  viewerRole: string;
  staffOptions: { id: string; role: string | null; name: string | null; email: string }[];
  t: ContentTranslations;
  locale: string;
  currentAttention: ContentPresentation['currentAttention'];
  detailLabels: ContentPresentation['detailLabels'];
};
export function StaffHandoffContentRow({
  handoff,
  staffId,
  viewerRole,
  staffOptions,
  t,
  locale,
  currentAttention,
  detailLabels,
}: ContentRowProps) {
  return (
    <SupportHandoffAttentionRow
      key={handoff.id}
      handoffId={handoff.id}
      isAttentionQueue={currentAttention === 'needs_follow_up'}
    >
      <div>
        <div className="font-medium text-slate-900" data-testid="staff-support-handoff-subject">
          {handoff.subject}
        </div>
        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{handoff.message}</div>
        {handoff.publicResponseAt ? (
          <div
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900"
            data-testid="staff-support-handoff-public-response-badge"
          >
            <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t('table.public_response_sent')}</span>
          </div>
        ) : null}
        {handoff.needsFollowUp ? (
          <div
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900"
            data-testid="staff-support-handoff-needs-follow-up-badge"
          >
            <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t('table.needs_follow_up')}</span>
          </div>
        ) : null}
        <SupportHandoffClaimLink
          claim={handoff.claim}
          fallbackLabel={t('table.claim_link')}
          noClaimLabel={t('table.no_claim')}
        />
      </div>
      <div>
        <div className="font-medium text-slate-900">{handoff.member.name}</div>
        <div className="text-xs text-muted-foreground">
          {handoff.member.memberNumber || t('table.no_member_number')}
        </div>
        <div className="text-xs text-muted-foreground">{handoff.member.email}</div>
      </div>
      <div
        className="space-y-1 text-xs text-muted-foreground"
        data-testid="staff-support-handoff-relationship"
      >
        <div>{handoff.relationship.branchName || t('table.no_branch')}</div>
        <div>{handoff.relationship.planName || t('table.no_plan')}</div>
        <div>{handoff.relationship.agentName || t('table.no_agent')}</div>
      </div>
      <div>
        <div className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-900">
          {t(`urgency.${handoff.urgency}`)}
        </div>
        <div className="mt-2 text-xs font-medium text-slate-700">
          {t(`trust_risk.${handoff.trustRisk}`)}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{t(`status.${handoff.status}`)}</div>
      </div>
      <div>
        <div className="font-medium text-slate-900">
          {handoff.staffName || t('table.unassigned')}
        </div>
        <div className="text-xs text-muted-foreground">
          {new Date(handoff.createdAt).toLocaleDateString(locale)}
        </div>
      </div>
      <StaffHandoffContentActions
        handoff={handoff}
        staffId={staffId}
        viewerRole={viewerRole}
        staffOptions={staffOptions}
        t={t}
      />
      <SupportHandoffDetailPanel
        canRespond={
          viewerRole === 'staff' && handoff.status === 'accepted' && handoff.staffId === staffId
        }
        createdAt={handoff.createdAt}
        handoffId={handoff.id}
        labels={detailLabels}
        locale={locale}
        message={handoff.message}
      />
    </SupportHandoffAttentionRow>
  );
}
