import { OUTLINED_LINK } from '@/components/dashboard/member-portal-link-styles';
import { Link } from '@/i18n/routing';
import type { StaffClaimsListItem } from '@interdomestik/domain-claims';
import { Fragment, type ReactNode } from 'react';

type QueueGroup = 'staff' | 'member' | 'untracked' | 'unassigned' | null;

type Props = Readonly<{
  claims: readonly StaffClaimsListItem[];
  getGroup: (claim: StaffClaimsListItem) => QueueGroup;
  hasActiveFilters: boolean;
  renderRow: (claim: StaffClaimsListItem, heading: 'h2' | 'h3') => ReactNode;
  tClaims: (key: string) => string;
}>;

export function StaffClaimsQueue({
  claims,
  getGroup,
  hasActiveFilters,
  renderRow,
  tClaims,
}: Props) {
  const groups = new Map<QueueGroup, StaffClaimsListItem[]>();
  // Claims arrive in display order. Insertion order keeps both groups and rows in that order.
  for (const claim of claims) {
    const group = getGroup(claim);
    const groupClaims = groups.get(group);
    if (groupClaims) {
      groupClaims.push(claim);
    } else {
      groups.set(group, [claim]);
    }
  }

  return (
    <section aria-labelledby="staff-claims-title" data-testid="staff-claims-queue">
      <div className="space-y-6" data-testid="staff-claims-list">
        {Array.from(groups, ([group, groupClaims]) => {
          const heading = group ? 'h3' : 'h2';
          const list = (
            <ul className="space-y-3">{groupClaims.map(claim => renderRow(claim, heading))}</ul>
          );

          if (group === null) return <Fragment key="manager">{list}</Fragment>;

          const headingId = `staff-claims-group-${group}`;
          return (
            <section aria-labelledby={headingId} className="space-y-3" key={group}>
              <h2
                className="text-lg font-semibold tracking-tight"
                id={headingId}
                data-testid={headingId}
              >
                {tClaims(`staff_queue.attention.group.${group}`)}
              </h2>
              {list}
            </section>
          );
        })}
        {claims.length === 0 && (
          <div
            className="min-w-0 space-y-3 rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] p-5 [overflow-wrap:anywhere] sm:p-6 forced-colors:border-[CanvasText]"
            data-testid="staff-claims-empty"
          >
            <p className="text-sm text-muted-foreground">
              {hasActiveFilters
                ? tClaims('staff_queue.empty_filtered')
                : tClaims('staff_queue.empty_default')}
            </p>
            {hasActiveFilters && (
              <Link
                className={`${OUTLINED_LINK} scroll-my-24`}
                href="/staff/claims"
                prefetch={false}
              >
                {tClaims('staff_queue.clear_filters')}
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
