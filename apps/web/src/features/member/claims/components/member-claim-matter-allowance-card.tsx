import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import type { MemberClaimDetailOpsClaim } from './member-claim-detail-types';

type MatterAllowance = NonNullable<MemberClaimDetailOpsClaim['matterAllowance']>;

const ALLOWANCE_FIELDS = [
  { key: 'used', testId: 'member-claim-matter-allowance-used', pick: a => a.consumedCount },
  {
    key: 'remaining',
    testId: 'member-claim-matter-allowance-remaining',
    pick: a => a.remainingCount,
  },
  { key: 'total', testId: 'member-claim-matter-allowance-total', pick: a => a.allowanceTotal },
] as const satisfies ReadonlyArray<{
  key: string;
  testId: string;
  pick: (allowance: MatterAllowance) => number;
}>;

/**
 * Only staff-accepted recovery matters consume the allowance (submitting a case does not), so the
 * card states that rule instead of implying that every case counts.
 */
export function MemberClaimMatterAllowanceCard({
  allowance,
}: Readonly<{ allowance: MatterAllowance }>): React.JSX.Element {
  const t = useTranslations('claims.detail.matterAllowance');
  return (
    <Card data-testid="member-claim-matter-allowance">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription data-testid="member-claim-matter-allowance-hint">
          {t('hint')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          {ALLOWANCE_FIELDS.map(field => (
            <div key={field.key}>
              <span className="text-xs uppercase text-muted-foreground">{t(field.key)}</span>
              <p className="mt-1 text-lg font-semibold" data-testid={field.testId}>
                {field.pick(allowance)}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
