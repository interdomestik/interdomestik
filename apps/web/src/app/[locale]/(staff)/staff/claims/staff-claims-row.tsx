import { ClaimStatusBadge } from '@/components/dashboard/claims/claim-status-badge';
import { OUTLINED_LINK } from '@/components/dashboard/member-portal-link-styles';
import { Link } from '@/i18n/routing';
import { formatPilotDate, formatPilotDateTime } from '@/lib/utils/date';
import type { AssignedClaimAttention, StaffClaimsListItem } from '@interdomestik/domain-claims';

type Translate = (key: string, values?: Record<string, string | number>) => string;

type Props = Readonly<{
  claim: StaffClaimsListItem;
  currentStaffId: string;
  heading: 'h2' | 'h3';
  locale: string;
  attention: AssignedClaimAttention | null;
  tClaims: Translate;
}>;

function getAssignmentStateLabel(
  args: Readonly<{
    assigneeId: string | null;
    assigneeName?: string | null;
    assigneeEmail?: string | null;
    currentStaffId: string;
    t: Translate;
  }>
): string {
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
  heading: Heading,
  locale,
  tClaims,
}: Props) {
  const unavailable = tClaims('staff_queue.table.unavailable');
  const overdueDate = attention?.overdueFollowUpDueAt;
  const overdueCopy =
    attention?.overdueFollowUpSource === 'case_register'
      ? 'staff_queue.attention.overdue_register_follow_up'
      : 'staff_queue.attention.overdue_follow_up';

  return (
    <li
      className="min-w-0 space-y-4 rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] p-4 [overflow-wrap:anywhere] sm:p-5 forced-colors:border-[CanvasText]"
      data-testid="staff-claims-row"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Heading className="min-w-0">
          <Link
            className={`${OUTLINED_LINK} scroll-my-24 underline underline-offset-4`}
            href={`/staff/claims/${claim.id}`}
            prefetch={false}
            data-testid="staff-claims-view"
          >
            <span className="min-w-0" data-testid="staff-claim-title">
              {claim.title || claim.claimNumber || claim.id}
            </span>
          </Link>
        </Heading>
        {claim.isDiasporaOrigin && (
          <span
            className="max-w-full rounded-full border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-strong))] px-2.5 py-1 text-xs font-medium forced-colors:border-[CanvasText]"
            data-testid="staff-claim-origin-badge"
          >
            {tClaims('staff_queue.origin_badge')}
          </span>
        )}
      </div>

      <dl className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-2 xl:grid-cols-3 [&_dt]:font-semibold [&_dd]:mt-1">
        <div>
          <dt>{tClaims('staff_queue.table.reference')}</dt>
          <dd>
            <span className="block">
              {claim.claimNumber || tClaims('staff_queue.table.no_claim_number')}
            </span>
            <span className="block text-muted-foreground">
              {claim.companyName || tClaims('staff_queue.table.no_company')}
            </span>
          </dd>
        </div>
        <div>
          <dt>{tClaims('staff_queue.table.member')}</dt>
          <dd>
            <span className="block">{claim.memberName || unavailable}</span>
            <span className="block text-muted-foreground">
              {claim.memberNumber
                ? `#${claim.memberNumber}`
                : tClaims('staff_queue.table.no_member_number')}
            </span>
          </dd>
        </div>
        <div>
          <dt>{tClaims('staff_queue.table.status_stage')}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <ClaimStatusBadge status={claim.status} />
            {!claim.status && claim.stageLabel && <span>{claim.stageLabel}</span>}
          </dd>
        </div>
        <div>
          <dt>{tClaims('staff_queue.table.assignment')}</dt>
          <dd data-testid="staff-claim-assignment-state">
            {getAssignmentStateLabel({
              assigneeId: claim.staffId,
              assigneeName: claim.assigneeName,
              assigneeEmail: claim.assigneeEmail,
              currentStaffId,
              t: tClaims,
            })}
          </dd>
        </div>
        {attention && (
          <div>
            <dt>{tClaims('staff_queue.table.next_step')}</dt>
            <dd data-testid="staff-claim-next-actor">
              {tClaims(`staff_queue.attention.next_actor.${attention.nextActor}`)}
            </dd>
          </div>
        )}
        <div>
          <dt>{tClaims('staff_queue.table.updated')}</dt>
          <dd>{formatPilotDate(claim.updatedAt, locale, unavailable)}</dd>
        </div>
      </dl>

      {overdueDate && (
        <p
          className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 forced-colors:border-[CanvasText]"
          data-testid="staff-claim-overdue-follow-up"
        >
          {tClaims(overdueCopy, { date: formatPilotDateTime(overdueDate, locale, overdueDate) })}
        </p>
      )}
    </li>
  );
}
