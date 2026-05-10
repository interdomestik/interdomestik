'use client';

import { getSupportHandoffDetail } from '@/actions/support-handoffs/detail';
import { updateSupportHandoffPublicResponse } from '@/actions/support-handoffs/response';
import { MAX_PUBLIC_RESPONSE_LENGTH } from '@interdomestik/domain-claims/support-handoffs/types';
import type {
  SupportHandoffContactPreference,
  SupportHandoffStaffDetail,
} from '@interdomestik/domain-claims/support-handoffs/types';
import { Button } from '@interdomestik/ui';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Mail,
  MessageSquare,
  Phone,
  Smartphone,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { SUPPORT_HANDOFF_ATTENTION_RESOLVED_EVENT } from './support-handoff-attention-row';

type DetailLabels = Readonly<{
  collapse: string;
  contactPreference: string;
  contactPreferenceEmail: string;
  contactPreferencePhone: string;
  contactPreferenceStaffReply: string;
  contactPreferenceWhatsapp: string;
  expand: string;
  fullMessage: string;
  lifecycle: string;
  lifecycleAccepted: string;
  lifecycleClosed: string;
  lifecycleCreated: string;
  lifecyclePending: string;
  lifecycleReassigned: string;
  lifecycleReason: string;
  loading: string;
  memberReplyAt: string;
  memberReplyEmpty: string;
  memberReplyTitle: string;
  memberReplyWarning: string;
  publicResponseEmpty: string;
  publicResponseAcknowledgedAt: string;
  publicResponseAwaitingAcknowledgement: string;
  publicResponseLabel: string;
  publicResponsePlaceholder: string;
  publicResponseReadonly: string;
  publicResponseSubmit: string;
  publicResponseTitle: string;
  publicResponseUpdate: string;
  source: string;
  sourceClaimDetail: string;
  sourceMemberHelp: string;
  sourceUnknown: string;
  unavailable: string;
}>;

type Props = Readonly<{
  canRespond: boolean;
  createdAt: string;
  handoffId: string;
  labels: DetailLabels;
  locale: string;
  message: string;
}>;

type TimelineStep = {
  actor?: string | null;
  event: 'created' | 'accepted' | 'reassigned' | 'closed';
  label: string;
  reason?: string | null;
  timestamp: string | null;
};

type LifecycleTimelineProps = Readonly<{
  createdAt: string;
  detail: SupportHandoffStaffDetail;
  labels: DetailLabels;
  locale: string;
}>;

const contactPreferenceClasses: Record<SupportHandoffContactPreference, string> = {
  staff_reply: 'border-slate-200 bg-slate-50 text-slate-800',
  phone: 'border-amber-200 bg-amber-50 text-amber-900',
  email: 'border-sky-200 bg-sky-50 text-sky-900',
  whatsapp: 'border-emerald-200 bg-emerald-50 text-emerald-900',
};

function ContactPreferenceIcon({ value }: Readonly<{ value: SupportHandoffContactPreference }>) {
  if (value === 'phone') return <Phone className="h-3.5 w-3.5" aria-hidden="true" />;
  if (value === 'email') return <Mail className="h-3.5 w-3.5" aria-hidden="true" />;
  if (value === 'whatsapp') return <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />;
  return <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />;
}

function getContactPreferenceLabel(value: SupportHandoffContactPreference, labels: DetailLabels) {
  if (value === 'phone') return labels.contactPreferencePhone;
  if (value === 'email') return labels.contactPreferenceEmail;
  if (value === 'whatsapp') return labels.contactPreferenceWhatsapp;
  return labels.contactPreferenceStaffReply;
}

function getSourceLabel(source: string, labels: DetailLabels) {
  if (source === 'member_help') return labels.sourceMemberHelp;
  if (source === 'claim_detail' || source === 'member_claim_detail') {
    return labels.sourceClaimDetail;
  }
  return labels.sourceUnknown;
}

function formatDateTime(value: string | null, locale: string, pendingLabel: string) {
  if (!value) return pendingLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return pendingLabel;
  return date.toLocaleString(locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
    timeStyle: 'short',
  });
}

function getCurrentCycleMemberReply(detail: SupportHandoffStaffDetail) {
  if (
    detail.memberReply.memberReply &&
    detail.memberReply.memberReplyResponseVersion === detail.publicResponse.publicResponseVersion
  ) {
    return detail.memberReply;
  }

  return null;
}

function getLatestMemberReply(detail: SupportHandoffStaffDetail) {
  return detail.memberReply.memberReply ? detail.memberReply : null;
}

function StaffHandoffLifecycleTimeline({
  createdAt,
  detail,
  labels,
  locale,
}: LifecycleTimelineProps) {
  const steps: TimelineStep[] = [
    {
      event: 'created',
      label: labels.lifecycleCreated,
      timestamp: createdAt,
    },
    {
      actor: detail.acceptedByName,
      event: 'accepted',
      label: labels.lifecycleAccepted,
      timestamp: detail.acceptedAt,
    },
    {
      actor: detail.reassignedByName,
      event: 'reassigned',
      label: labels.lifecycleReassigned,
      reason: detail.reassignReason,
      timestamp: detail.reassignedAt,
    },
    {
      actor: detail.closedByName,
      event: 'closed',
      label: labels.lifecycleClosed,
      reason: detail.closeReason,
      timestamp: detail.closedAt,
    },
  ];

  return (
    <div data-testid="staff-support-handoff-lifecycle">
      <div className="text-xs font-semibold uppercase text-slate-500">{labels.lifecycle}</div>
      <div className="mt-3 space-y-3">
        {steps.map(step => {
          const isPending = !step.timestamp;
          return (
            <div
              key={step.event}
              className="grid gap-2 border-l border-slate-200 pl-3 text-xs md:grid-cols-[8rem_1fr]"
              data-testid={`staff-support-handoff-lifecycle-${step.event}`}
            >
              <div
                className={isPending ? 'font-medium text-slate-400' : 'font-medium text-slate-800'}
              >
                {step.label}
              </div>
              <div className={isPending ? 'text-slate-400' : 'text-slate-600'}>
                <div>{formatDateTime(step.timestamp, locale, labels.lifecyclePending)}</div>
                {step.actor ? <div className="mt-0.5 text-slate-500">{step.actor}</div> : null}
                {step.reason ? (
                  <div className="mt-1 text-slate-700">
                    {labels.lifecycleReason}: {step.reason}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PublicResponseAcknowledgementStatus({
  labels,
  locale,
  publicResponse,
}: Readonly<{
  labels: DetailLabels;
  locale: string;
  publicResponse: SupportHandoffStaffDetail['publicResponse'];
}>) {
  if (!publicResponse.publicResponse) {
    return null;
  }

  if (!publicResponse.publicResponseAcknowledged) {
    return (
      <div
        className="mt-3 inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900"
        data-testid="staff-support-handoff-public-response-awaiting-acknowledgement"
      >
        <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{labels.publicResponseAwaitingAcknowledgement}</span>
      </div>
    );
  }

  const acknowledgedAt = formatDateTime(
    publicResponse.publicResponseAcknowledgedAt,
    locale,
    labels.lifecyclePending
  );

  return (
    <div
      className="mt-3 inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800"
      data-testid="staff-support-handoff-public-response-acknowledged"
    >
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{labels.publicResponseAcknowledgedAt.replace('{date}', acknowledgedAt)}</span>
    </div>
  );
}

export function SupportHandoffDetailPanel({
  canRespond,
  createdAt,
  handoffId,
  labels,
  locale,
  message,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [detail, setDetail] = useState<SupportHandoffStaffDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isResponsePending, startResponseTransition] = useTransition();
  const router = useRouter();

  function toggleDetail() {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    setIsOpen(true);
    setError(null);
    if (detail) return;

    startTransition(async () => {
      const result = await getSupportHandoffDetail(handoffId);
      if (!result) {
        setError(labels.unavailable);
        return;
      }
      setDetail(result);
      router.refresh();
    });
  }

  function submitPublicResponse(formData: FormData) {
    setError(null);
    startResponseTransition(async () => {
      await updateSupportHandoffPublicResponse(formData);
      const result = await getSupportHandoffDetail(handoffId);
      if (!result) {
        setError(labels.unavailable);
        return;
      }
      setDetail(result);
      router.refresh();
      globalThis.dispatchEvent(
        new CustomEvent(SUPPORT_HANDOFF_ATTENTION_RESOLVED_EVENT, {
          detail: { handoffId },
        })
      );
    });
  }

  return (
    <div className="md:col-span-6">
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
          {error ? <div className="text-sm font-medium text-red-700">{error}</div> : null}
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
                ) : detail.publicResponse.publicResponse ? (
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
