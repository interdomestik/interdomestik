'use client';

import { getSupportHandoffDetail } from '@/actions/support-handoffs/detail';
import type {
  SupportHandoffContactPreference,
  SupportHandoffDetailFields,
} from '@interdomestik/domain-claims/support-handoffs/types';
import { Button } from '@interdomestik/ui';
import { ChevronDown, ChevronUp, Mail, MessageSquare, Phone, Smartphone } from 'lucide-react';
import { useState, useTransition } from 'react';

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
  source: string;
  sourceClaimDetail: string;
  sourceMemberHelp: string;
  sourceUnknown: string;
  unavailable: string;
}>;

type Props = Readonly<{
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
  detail: SupportHandoffDetailFields;
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
    timeStyle: 'short',
  });
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

export function SupportHandoffDetailPanel({
  createdAt,
  handoffId,
  labels,
  locale,
  message,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [detail, setDetail] = useState<SupportHandoffDetailFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
