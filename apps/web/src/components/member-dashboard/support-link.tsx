import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

export type SupportLinkProps = {
  href: string;
};

export async function SupportLink({ href }: SupportLinkProps): Promise<ReactElement> {
  const t = await getTranslations('dashboard.member_landing');

  return (
    <section data-testid="member-support-link">
      <Link href={href}>{t('help_label')}</Link>
    </section>
  );
}
