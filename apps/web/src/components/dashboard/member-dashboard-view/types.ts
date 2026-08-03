import type { MemberDashboardData } from '@interdomestik/domain-member';

import type { getActiveSubscription } from '@interdomestik/domain-membership-billing/subscription';

export type MemberDashboardViewProps = {
  dataPromise: Promise<MemberDashboardData>;
  draftManagerAvailable?: boolean;
  supplementalDataPromise: Promise<
    readonly [Awaited<ReturnType<typeof getActiveSubscription>>, number, boolean?]
  >;
  locale: string;
};

export type DashboardClaim = MemberDashboardData['claims'][number];

export type TranslationValues = Record<string, string | number | boolean | Date | null | undefined>;

export type DashboardTranslator = (key: string, values?: TranslationValues) => string;
