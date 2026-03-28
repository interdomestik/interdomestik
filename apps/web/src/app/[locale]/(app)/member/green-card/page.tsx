import { getTranslations, setRequestLocale } from 'next-intl/server';

import { MemberCtaHandoffPage } from '../_cta-handoff-page';

export default async function Page({ params }: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'dashboard.home_grid' });
  const handoffT = await getTranslations({
    locale,
    namespace: 'dashboard.member_cta_pages.green_card',
  });
  const sharedT = await getTranslations({
    locale,
    namespace: 'dashboard.member_cta_pages.shared',
  });

  return (
    <MemberCtaHandoffPage
      boundary={handoffT('boundary')}
      description={handoffT('description')}
      nextStepsLabel={sharedT('next_steps')}
      primaryHref="/member/diaspora"
      primaryLabel={handoffT('primary')}
      secondaryLabel={sharedT('secondary')}
      testId="green-card-page-ready"
      title={t('cta_green_card')}
    />
  );
}
