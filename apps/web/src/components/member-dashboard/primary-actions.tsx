import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

export type PrimaryActionsProps = {
  locale: string;
};

export async function PrimaryActions({ locale }: PrimaryActionsProps): Promise<ReactElement> {
  const t = await getTranslations('dashboard.member_landing');

  return (
    <section data-testid="member-primary-actions" className="flex flex-wrap gap-3">
      <Link data-testid="member-start-claim-cta" data-locale={locale} href="/member/claims/new">
        {t('primary_cta')}
      </Link>
      <Link data-testid="member-view-claims-cta" data-locale={locale} href="/member/claims">
        {t('secondary_cta')}
      </Link>
    </section>
  );
}
