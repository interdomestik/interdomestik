import type { MemberDashboardData } from '@interdomestik/domain-member';

export type MemberDashboardViewProps = {
  data: MemberDashboardData;
  locale: string;
};

export type DashboardClaim = MemberDashboardData['claims'][number];

export type TranslationValues = Record<string, string | number | boolean | Date | null | undefined>;

export type DashboardTranslator = (key: string, values?: TranslationValues) => string;
