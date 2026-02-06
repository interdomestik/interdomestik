import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

export type MemberEmptyStateProps = {
  locale: string;
};

export async function MemberEmptyState({ locale }: MemberEmptyStateProps): Promise<ReactElement> {
  const t = await getTranslations('dashboard.member_landing');

  return (
    <section data-testid="member-empty-state">
      <h2>{t('empty_title')}</h2>
      <p>{t('empty_body')}</p>
      <Link
        data-testid="member-empty-start-claim-cta"
        data-locale={locale}
        href="/member/claims/new"
      >
        {t('primary_cta')}
      </Link>
    </section>
  );
}
