import { Link } from '@/i18n/routing';
import type { ReactElement } from 'react';

export type MemberEmptyStateProps = {
  locale: string;
};

export function MemberEmptyState({ locale }: MemberEmptyStateProps): ReactElement {
  return (
    <section data-testid="member-empty-state">
      <h2>No claims yet</h2>
      <p>When you submit a claim, it will appear here.</p>
      <Link data-testid="member-start-claim-cta" data-locale={locale} href="/member/claims/new">
        Start a new claim
      </Link>
    </section>
  );
}
