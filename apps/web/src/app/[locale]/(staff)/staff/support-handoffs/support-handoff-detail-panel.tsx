'use client';

import { MAX_PUBLIC_RESPONSE_LENGTH } from '@interdomestik/domain-claims/support-handoffs/types';
import { getPortalErrorCopy } from '@/components/portal-error-copy';
import { Button } from '@interdomestik/ui';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useHandoffDetail } from './use-handoff-detail';
import type { DetailLabels } from './support-handoff-detail-labels';
import {
  ContactPreferenceIcon,
  contactPreferenceClasses,
  getContactPreferenceLabel,
  getSourceLabel,
  StaffHandoffLifecycleTimeline,
  PublicResponseAcknowledgementStatus,
  getLatestMemberReply,
  getCurrentCycleMemberReply,
  formatDateTime,
} from './support-handoff-detail-parts';

type Props = Readonly<{
  canRespond: boolean;
  createdAt: string;
  handoffId: string;
  labels: DetailLabels;
  locale: string;
  message: string;
}>;

export function SupportHandoffDetailPanel({
  canRespond,
  createdAt,
  handoffId,
  labels,
  locale,
  message,
}: Props) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { detail, error, isPending, isResponsePending, retryDetail, submitPublicResponse } =
    useHandoffDetail(handoffId, labels.unavailable);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  function toggleDetail() {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    setIsOpen(true);
    if (!detail) retryDetail();
  }

  return (
    <div className="md:col-span-6" data-hydrated={isHydrated ? 'true' : 'false'}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={toggleDetail}
        aria-expanded={isOpen}
        data-testid="staff-support-handoff-detail-toggle"
      >
        <span>{isOpen ? labels.collapse : labels.expand}</span>
        {isOpen ? (
          <ChevronUp className="ml-2 h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronDown className="ml-2 h-4 w-4" aria-hidden="true" />
        )}
      </Button>

      {isOpen ? (
        <div
          className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-left"
          data-testid="staff-support-handoff-detail-panel"
        >
          {isPending && !detail ? (
            <div className="text-sm text-muted-foreground">{labels.loading}</div>
          ) : null}
          {error ? (
            <div role="alert" className="space-y-2 text-sm font-medium text-red-700">
              <p>{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={retryDetail}
                disabled={isPending || isResponsePending}
              >
                {getPortalErrorCopy(locale).retry}
              </Button>
            </div>
          ) : null}
          {detail ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <div
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                    contactPreferenceClasses[detail.contactPreference]
                  }`}
                  aria-label={`${labels.contactPreference}: ${getContactPreferenceLabel(
                    detail.contactPreference,
                    labels
                  )}`}
                  data-testid="staff-support-handoff-contact-preference"
                >
                  <ContactPreferenceIcon value={detail.contactPreference} />
                  <span>{getContactPreferenceLabel(detail.contactPreference, labels)}</span>
                </div>
                <div
                  className="text-xs text-muted-foreground"
                  data-testid="staff-support-handoff-source"
                >
                  {labels.source}: {getSourceLabel(detail.source, labels)}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">
                  {labels.fullMessage}
                </div>
                <p
                  className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800"
                  data-testid="staff-support-handoff-full-message"
                >
                  {message}
                </p>
              </div>

              <StaffHandoffLifecycleTimeline
                createdAt={createdAt}
                detail={detail}
                labels={labels}
                locale={locale}
              />

              <div
                className="rounded-md border border-slate-200 bg-white p-3"
                data-testid="staff-support-handoff-public-response-section"
              >
                <div className="text-xs font-semibold uppercase text-slate-500">
                  {labels.publicResponseTitle}
                </div>
                {detail.publicResponse.publicResponse ? (
                  <p
                    className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800"
                    data-testid="staff-support-handoff-public-response-existing"
                  >
                    {detail.publicResponse.publicResponse}
                  </p>
                ) : (
                  <p
                    className="mt-2 text-sm text-muted-foreground"
                    data-testid="staff-support-handoff-public-response-empty"
                  >
                    {labels.publicResponseEmpty}
                  </p>
                )}
                <PublicResponseAcknowledgementStatus
                  labels={labels}
                  locale={locale}
                  publicResponse={detail.publicResponse}
                />
                {getLatestMemberReply(detail) ? (
                  <div
                    className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3"
                    data-testid="handoff-member-reply"
                  >
                    <div className="text-xs font-semibold uppercase text-sky-700">
                      {labels.memberReplyTitle}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                      {getLatestMemberReply(detail)?.memberReply}
                    </p>
                    <div className="mt-2 text-xs text-sky-800">
                      {labels.memberReplyAt.replace(
                        '{date}',
                        formatDateTime(
                          getLatestMemberReply(detail)?.memberReplyAt ?? null,
                          locale,
                          labels.lifecyclePending
                        )
                      )}
                    </div>
                  </div>
                ) : null}
                {!getLatestMemberReply(detail) && detail.publicResponse.publicResponse ? (
                  <p
                    className="mt-3 text-xs text-muted-foreground"
                    data-testid="handoff-member-reply-empty"
                  >
                    {labels.memberReplyEmpty}
                  </p>
                ) : null}

                {canRespond ? (
                  <form
                    key={detail.publicResponse.publicResponseVersion}
                    action={submitPublicResponse}
                    className="mt-3 space-y-3"
                    data-testid="staff-support-handoff-public-response-form"
                  >
                    <input type="hidden" name="handoffId" value={handoffId} />
                    <input
                      type="hidden"
                      name="expectedVersion"
                      value={detail.publicResponse.publicResponseVersion}
                    />
                    <label
                      htmlFor={`public-response-${handoffId}`}
                      className="block text-xs font-medium text-slate-700"
                    >
                      {labels.publicResponseLabel}
                    </label>
                    <textarea
                      id={`public-response-${handoffId}`}
                      name="publicResponse"
                      required
                      maxLength={MAX_PUBLIC_RESPONSE_LENGTH}
                      defaultValue={detail.publicResponse.publicResponse ?? ''}
                      placeholder={labels.publicResponsePlaceholder}
                      className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-6"
                      data-testid="staff-support-handoff-public-response-input"
                    />
                    {getCurrentCycleMemberReply(detail) ? (
                      <p
                        className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
                        data-testid="staff-support-handoff-member-reply-warning"
                      >
                        {labels.memberReplyWarning}
                      </p>
                    ) : null}
                    <Button
                      type="submit"
                      size="sm"
                      disabled={isResponsePending}
                      data-testid="staff-support-handoff-public-response-submit"
                    >
                      {detail.publicResponse.publicResponse
                        ? labels.publicResponseUpdate
                        : labels.publicResponseSubmit}
                    </Button>
                  </form>
                ) : (
                  <p
                    className="mt-3 text-xs text-muted-foreground"
                    data-testid="staff-support-handoff-public-response-readonly"
                  >
                    {labels.publicResponseReadonly}
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
