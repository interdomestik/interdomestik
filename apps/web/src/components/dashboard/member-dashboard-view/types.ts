import type { MemberDashboardData } from '@interdomestik/domain-member';

import type { ActiveSubscription } from '@interdomestik/domain-membership-billing/subscription';

export type MemberDashboardViewProps = {
  dataPromise: Promise<MemberDashboardData>;
  supplementalDataPromise: Promise<readonly [ActiveSubscription | null, number]>;
  locale: string;
};

export type DashboardClaim = MemberDashboardData['claims'][number];

export type TranslationValues = Record<string, string | number | boolean | Date | null | undefined>;

export type DashboardTranslator = (key: string, values?: TranslationValues) => string;
