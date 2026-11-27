import { OUTLINED_LINK } from '@/components/dashboard/member-portal-link-styles';
import type { StaffClaimsListItem } from '@interdomestik/domain-claims';
import { Fragment, type ReactNode } from 'react';

type QueueGroup = 'staff' | 'member' | 'untracked' | 'unassigned' | null;

type Props = Readonly<{
  claims: readonly StaffClaimsListItem[];
  getGroup: (claim: StaffClaimsListItem) => QueueGroup;
  hasActiveFilters: boolean;
  locale: string;
  renderRow: (claim: StaffClaimsListItem, heading: 'h2' | 'h3') => ReactNode;
  tClaims: (key: string) => string;
}>;

export function StaffClaimsQueue({
  claims,
  getGroup,
  hasActiveFilters,
  locale,
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
          // A styled ul without markers loses its list role in WebKit; a div with the role keeps it.
          const list = (
            <div className="space-y-3" role="list">
              {groupClaims.map(claim => renderRow(claim, heading))}
            </div>
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
              // A full page load (as the slice 1 region actions do) also resets the search draft.
              <a className={`${OUTLINED_LINK} scroll-my-24`} href={`/${locale}/staff/claims`}>
                {tClaims('staff_queue.clear_filters')}
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
