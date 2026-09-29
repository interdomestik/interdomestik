import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { Link } from '@/i18n/routing';
import type { AssignedClaimAttention, StaffClaimsListItem } from '@interdomestik/domain-claims';
import { Button } from '@interdomestik/ui';

type Translate = (key: string, values?: Record<string, string | number>) => string;

type Props = {
  claim: StaffClaimsListItem;
  currentStaffId: string;
  locale: string;
  attention: AssignedClaimAttention | null;
  tClaims: Translate;
  tStatus: Translate;
};

function getAssignmentStateLabel(args: {
  assigneeId: string | null;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  currentStaffId: string;
  t: Translate;
}): string {
  if (args.assigneeId == null) return args.t('staff_queue.assignment_state.unassigned');
  if (args.assigneeId === args.currentStaffId)
    return args.t('staff_queue.assignment_state.assigned_to_you');
  const assigneeLabel = args.assigneeName || args.assigneeEmail;
  return assigneeLabel
    ? args.t('staff_queue.assignment_state.assigned_to_named', { name: assigneeLabel })
    : args.t('staff_queue.assignment_state.assigned');
}

export function StaffClaimsRow({
  attention,
  claim,
  currentStaffId,
  locale,
  tClaims,
  tStatus,
}: Readonly<Props>) {
  const overdueDate = attention?.overdueFollowUpDueAt;
  const dueFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div
      className="grid grid-cols-1 items-center gap-4 px-4 py-3 text-sm md:grid-cols-5"
      data-testid="staff-claims-row"
    >
      <div>
        <div className="font-medium text-slate-900" data-testid="staff-claim-title">
          {claim.title || claim.claimNumber || claim.id}
        </div>
        <div className="text-xs text-muted-foreground">
          {claim.claimNumber || tClaims('staff_queue.table.no_claim_number')}
        </div>
        <div className="text-xs text-muted-foreground">
          {claim.companyName || tClaims('staff_queue.table.no_company')}
        </div>
        {claim.isDiasporaOrigin ? (
          <div
            className="mt-1 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
            data-testid="staff-claim-origin-badge"
          >
            {tClaims('staff_queue.origin_badge')}
          </div>
        ) : null}
      </div>
      <div>
        <div className="font-medium text-slate-900">{claim.memberName || '-'}</div>
        <div className="text-xs text-muted-foreground">
          {claim.memberNumber
            ? `#${claim.memberNumber}`
            : tClaims('staff_queue.table.no_member_number')}
        </div>
      </div>
      <div>
        <ClaimStatusBadge status={claim.status} />
        <div className="mt-1 text-xs text-muted-foreground">
          {claim.status ? tStatus(claim.status) : claim.stageLabel || '-'}
        </div>
        <div
          className="mt-1 text-xs font-medium text-slate-700"
          data-testid="staff-claim-assignment-state"
        >
          {getAssignmentStateLabel({
            assigneeId: claim.staffId,
            assigneeName: claim.assigneeName,
            assigneeEmail: claim.assigneeEmail,
            currentStaffId,
            t: tClaims,
          })}
        </div>
        {attention ? (
          <div
            className="mt-1 text-xs font-medium text-slate-700"
            data-testid="staff-claim-next-actor"
          >
            {tClaims(`staff_queue.attention.next_actor.${attention.nextActor}`)}
          </div>
        ) : null}
        {overdueDate ? (
          <p
            className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-950"
            data-testid="staff-claim-overdue-follow-up"
          >
            {tClaims('staff_queue.attention.overdue_follow_up', {
              date: dueFormatter.format(new Date(overdueDate)),
            })}
          </p>
        ) : null}
      </div>
      <div>{claim.updatedAt ? new Date(claim.updatedAt).toLocaleDateString(locale) : '-'}</div>
      <div className="text-right">
        <Button asChild variant="outline" size="sm">
          <Link href={`/staff/claims/${claim.id}`} prefetch={false} data-testid="staff-claims-view">
            {tClaims('actions.open')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
