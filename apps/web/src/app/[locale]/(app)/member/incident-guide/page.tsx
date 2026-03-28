import { getTranslations, setRequestLocale } from 'next-intl/server';

import { MemberCtaHandoffPage } from '../_cta-handoff-page';

export default async function Page({ params }: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'dashboard.home_grid' });
  const handoffT = await getTranslations({
    locale,
    namespace: 'dashboard.member_cta_pages.incident_guide',
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
      primaryHref="/member/claims/new"
      primaryLabel={handoffT('primary')}
      secondaryLabel={sharedT('secondary')}
      testId="incident-guide-page-ready"
      title={t('cta_incident')}
    />
  );
}
