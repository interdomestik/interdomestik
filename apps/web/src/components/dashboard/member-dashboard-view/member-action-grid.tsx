import { HomeGrid } from '@/components/member/HomeGrid';

import { MatteAnchorCard } from '../matte-anchor-card';
import type { DashboardTranslator } from './types';

export function MemberActionGrid({
  t,
  tLanding,
}: Readonly<{
  t: DashboardTranslator;
  tLanding: DashboardTranslator;
}>) {
  return (
    <HomeGrid className="sm:grid-cols-2 gap-6">
      {[
        {
          href: '/member/incident-guide',
          id: 'incident',
          label: t('home_grid.cta_incident'),
          iconName: 'incident',
          color: 'from-red-600 to-red-700',
          description: tLanding('cta_incident_kicker'),
        },
        {
          href: '/member/claim-report',
          id: 'report',
          label: t('home_grid.cta_report'),
          iconName: 'report',
          color: 'from-blue-600 to-blue-700',
          description: tLanding('cta_report_kicker'),
        },
        {
          href: '/member/green-card',
          id: 'green-card',
          label: t('home_grid.cta_green_card'),
          iconName: 'green-card',
          color: 'from-emerald-600 to-emerald-700',
          description: tLanding('cta_green_card_kicker'),
        },
        {
          href: '/member/benefits',
          id: 'benefits',
          label: t('home_grid.cta_benefits'),
          iconName: 'benefits',
          color: 'from-amber-400 to-orange-400',
          description: tLanding('cta_benefits_kicker'),
        },
      ].map(action => (
        <MatteAnchorCard
          key={action.id}
          href={action.href}
          label={action.label}
          iconName={action.iconName}
          description={action.description}
          colorClassName={action.color}
          testId={`home-cta-${action.id}`}
        />
      ))}
    </HomeGrid>
  );
}
