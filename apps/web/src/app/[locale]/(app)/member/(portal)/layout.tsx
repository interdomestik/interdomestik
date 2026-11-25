import { MemberAcceptanceStep } from '@/components/privacy/member-acceptance-step';
import type { ReactNode } from 'react';

import { MemberPortalFrame } from '@/components/dashboard/member-portal-runtime';

import { getMemberPortalContext } from './portal-context';
import MemberPortalPage from './page';

type Props = Readonly<{
  actions: ReactNode;
  case: ReactNode;
  children: ReactNode;
  params: Promise<{ locale: string }>;
  updates: ReactNode;
}>;

export default async function MemberPortalLayout({
  actions,
  case: caseRegion,
  params,
  updates,
}: Props) {
  const { locale } = await params;
  const context = await getMemberPortalContext(locale);
  if (!context.ok) return <MemberAcceptanceStep locale={locale} refusal={context} />;
  const { copy } = context;
  return (
    <MemberPortalPage
      content={
        <div data-testid="member-dashboard-ready">
          <MemberPortalFrame
            copy={copy}
            actionsRegion={actions}
            caseRegion={caseRegion}
            updatesRegion={updates}
          />
        </div>
      }
    />
  );
}
