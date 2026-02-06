import { Link } from '@/i18n/routing';
import type { ReactElement } from 'react';

export type ClaimsOverviewItem = {
  id: string;
  claimNumber: string | null;
  status: string;
  stageLabel: string;
  submittedAt: string | null;
  updatedAt: string | null;
  requiresMemberAction: boolean;
  nextMemberAction?: {
    label: string;
    href: string;
  };
};

export type ClaimsOverviewListProps = {
  claims: ClaimsOverviewItem[];
};

export function ClaimsOverviewList({ claims }: ClaimsOverviewListProps): ReactElement {
  return (
    <section data-testid="member-claims-list">
      <h2>Recent claims</h2>
      <ul>
        {claims.map(claim => (
          <li key={claim.id}>
            <span>{claim.claimNumber ?? '—'}</span>
            <span>{claim.status}</span>
            <span>{claim.stageLabel}</span>
            <span>{claim.submittedAt ?? '—'}</span>
            <span>{claim.updatedAt ?? '—'}</span>
            {claim.requiresMemberAction && claim.nextMemberAction ? (
              <Link href={claim.nextMemberAction.href}>{claim.nextMemberAction.label}</Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
