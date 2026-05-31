import type { MemberDashboardData } from '@interdomestik/domain-member';

import type { getActiveSubscription } from '@interdomestik/domain-membership-billing/subscription';

export type MemberDashboardViewProps = {
  dataPromise: Promise<MemberDashboardData>;
  supplementalDataPromise: Promise<
    readonly [Awaited<ReturnType<typeof getActiveSubscription>>, number]
  >;
  locale: string;
};

export type DashboardClaim = MemberDashboardData['claims'][number];

export type TranslationValues = Record<string, string | number | boolean | Date | null | undefined>;

export type DashboardTranslator = (key: string, values?: TranslationValues) => string;
