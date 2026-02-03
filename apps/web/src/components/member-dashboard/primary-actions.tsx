import { Link } from '@/i18n/routing';
import type { ReactElement } from 'react';

export type PrimaryActionsProps = {
  locale: string;
};

export function PrimaryActions({ locale }: PrimaryActionsProps): ReactElement {
  return (
    <section data-testid="member-primary-actions">
      <Link data-testid="member-start-claim-cta" data-locale={locale} href="/member/claims/new">
        Start a new claim
      </Link>
    </section>
  );
}
