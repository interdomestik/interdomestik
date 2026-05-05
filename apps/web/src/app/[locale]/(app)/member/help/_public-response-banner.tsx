import { getMemberLatestPublicResponse } from '@interdomestik/domain-claims/support-handoffs/response';
import { MessageSquareText } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';

type SelectedClaim = {
  id: string;
} | null;

type PublicResponseBannerProps = {
  handoffId?: string | null;
  memberId: string;
  selectedClaim: SelectedClaim;
  tenantId: string;
};

export async function PublicResponseBanner({
  handoffId,
  memberId,
  selectedClaim,
  tenantId,
}: Readonly<PublicResponseBannerProps>) {
  let response: Awaited<ReturnType<typeof getMemberLatestPublicResponse>>;
  try {
    response = await getMemberLatestPublicResponse({
      claimId: selectedClaim?.id ?? null,
      handoffId: handoffId ?? null,
      memberId,
      tenantId,
    });
  } catch (error) {
    console.error('Member support handoff public response lookup failed', error);
    return null;
  }

  if (!response?.publicResponse || !response.publicResponseAt) {
    return null;
  }

  const t = await getTranslations('help');
  const format = await getFormatter();
  const updatedAt = format.dateTime(new Date(response.publicResponseAt), {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div
      className="mb-4 flex gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950"
      data-testid="member-support-handoff-public-response"
    >
      <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase text-emerald-700">
          {t('publicResponse.title')}
        </div>
        <p
          className="whitespace-pre-wrap leading-6"
          data-testid="member-support-handoff-public-response-text"
        >
          {response.publicResponse}
        </p>
        <div
          className="text-xs text-emerald-800"
          data-testid="member-support-handoff-public-response-updated"
        >
          {t('publicResponse.updatedAt', { date: updatedAt })}
        </div>
      </div>
    </div>
  );
}
