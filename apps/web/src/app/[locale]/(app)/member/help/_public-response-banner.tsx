import { getMemberLatestPublicResponse } from '@interdomestik/domain-claims/support-handoffs/response';
import { MessageSquareText } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';

import { MemberReplyForm } from './_member-reply-form';
import { PublicResponseAcknowledgementForm } from './_public-response-acknowledgement-form';

type SelectedClaim = {
  id: string;
} | null;

type PublicResponseBannerProps = {
  handoffId?: string | null;
  locale: string;
  memberId: string;
  selectedClaim: SelectedClaim;
  tenantId: string;
};

export async function PublicResponseBanner({
  handoffId,
  locale,
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
  const acknowledgedAt = response.publicResponseAcknowledgedAt
    ? format.dateTime(new Date(response.publicResponseAcknowledgedAt), {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;
  const acknowledgementPermalink = `/${locale}/member/help?handoffId=${encodeURIComponent(response.handoffId)}`;
  const hasMemberReply = !!response.memberReply && response.memberReplyAt != null;
  const memberReplySlot = !hasMemberReply ? (
    <MemberReplyForm
      expectedPublicResponseVersion={response.publicResponseVersion}
      handoffId={response.handoffId}
      labels={{
        alreadyReplied: t('memberReply.alreadyReplied'),
        error: t('memberReply.error'),
        label: t('memberReply.label'),
        placeholder: t('memberReply.placeholder'),
        required: t('memberReply.required'),
        stale: t('memberReply.stale'),
        submit: t('memberReply.submit'),
        submitting: t('memberReply.submitting'),
        success: t('memberReply.sent'),
        tooLong: t('memberReply.tooLong'),
      }}
      locale={locale}
      permalink={acknowledgementPermalink}
    />
  ) : null;

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
        <PublicResponseAcknowledgementForm
          acknowledgedAt={response.publicResponseAcknowledgedAt}
          acknowledgedAtLabel={
            acknowledgedAt ? t('publicResponse.acknowledgedAt', { date: acknowledgedAt }) : null
          }
          expectedPublicResponseVersion={response.publicResponseVersion}
          handoffId={response.handoffId}
          labels={{
            acknowledge: t('publicResponse.acknowledge'),
            acknowledgedAt: t('publicResponse.acknowledgedAt', { date: '{date}' }),
            acknowledging: t('publicResponse.acknowledging'),
            error: t('publicResponse.acknowledgementError'),
            stale: t('publicResponse.acknowledgementStale'),
          }}
          locale={locale}
          memberReplySlot={memberReplySlot}
          permalink={acknowledgementPermalink}
        />
        {hasMemberReply ? (
          <div
            className="mt-3 inline-flex items-center rounded-md border border-emerald-200 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-emerald-800"
            data-testid="member-reply-success"
          >
            {t('memberReply.sent')}
          </div>
        ) : null}
      </div>
    </div>
  );
}
