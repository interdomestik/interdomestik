import { getMemberActiveHandoffAdvisory } from '@interdomestik/domain-claims/support-handoffs/advisory';
import { AlertCircle } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';

type SelectedClaim = {
  id: string;
} | null;

type AdvisoryBannerProps = {
  memberId: string;
  selectedClaim: SelectedClaim;
  tenantId: string;
};

export async function AdvisoryBanner({
  memberId,
  selectedClaim,
  tenantId,
}: Readonly<AdvisoryBannerProps>) {
  let advisory: Awaited<ReturnType<typeof getMemberActiveHandoffAdvisory>>;
  try {
    advisory = await getMemberActiveHandoffAdvisory({
      claimId: selectedClaim?.id ?? null,
      memberId,
      tenantId,
    });
  } catch (error) {
    console.error('Member support handoff advisory lookup failed', error);
    return null;
  }

  if (!advisory.claimMatch && advisory.activeCount <= 0) {
    return null;
  }

  const t = await getTranslations('help');
  const format = await getFormatter();

  if (advisory.claimMatch) {
    const submittedAt = format.dateTime(new Date(advisory.claimMatch.createdAt), {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    return (
      <div
        className="mb-4 flex gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950"
        data-testid="member-support-handoff-advisory-claim"
      >
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="space-y-1">
          <div className="font-medium">{t('advisory.claimSpecific')}</div>
          <div className="text-xs text-amber-800">
            {t('advisory.claimSpecificMeta', {
              date: submittedAt,
              status: t(`advisory.status.${advisory.claimMatch.status}`),
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mb-4 flex gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-950"
      data-testid="member-support-handoff-advisory-generic"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
      <div className="font-medium">
        {t('advisory.genericActive', { count: advisory.activeCount })}
      </div>
    </div>
  );
}
