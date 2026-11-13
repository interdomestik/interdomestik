import type {
  SupportHandoffContactPreference,
  SupportHandoffStaffDetail,
} from '@interdomestik/domain-claims/support-handoffs/types';
import { formatPilotDateTime } from '@/lib/utils/date';
import { CheckCircle2, Clock3, Mail, MessageSquare, Phone, Smartphone } from 'lucide-react';
import type { DetailLabels } from './support-handoff-detail-labels';

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

export const contactPreferenceClasses: Record<SupportHandoffContactPreference, string> = {
  staff_reply: 'border-slate-200 bg-slate-50 text-slate-800',
  phone: 'border-amber-200 bg-amber-50 text-amber-900',
  email: 'border-sky-200 bg-sky-50 text-sky-900',
  whatsapp: 'border-emerald-200 bg-emerald-50 text-emerald-900',
};

export function ContactPreferenceIcon({
  value,
}: Readonly<{ value: SupportHandoffContactPreference }>) {
  if (value === 'phone') return <Phone className="h-3.5 w-3.5" aria-hidden="true" />;
  if (value === 'email') return <Mail className="h-3.5 w-3.5" aria-hidden="true" />;
  if (value === 'whatsapp') return <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />;
  return <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />;
}

export function getContactPreferenceLabel(
  value: SupportHandoffContactPreference,
  labels: DetailLabels
) {
  if (value === 'phone') return labels.contactPreferencePhone;
  if (value === 'email') return labels.contactPreferenceEmail;
  if (value === 'whatsapp') return labels.contactPreferenceWhatsapp;
  return labels.contactPreferenceStaffReply;
}

export function getSourceLabel(source: string, labels: DetailLabels) {
  if (source === 'member_help') return labels.sourceMemberHelp;
  if (source === 'claim_detail' || source === 'member_claim_detail') {
    return labels.sourceClaimDetail;
  }
  return labels.sourceUnknown;
}

/** Pilot-zone "dd.MM.yyyy HH:mm" (en "MM/dd/yyyy HH:mm"), like the rest of the staff surface. */
export function formatDateTime(value: string | null, locale: string, pendingLabel: string) {
  return formatPilotDateTime(value, locale, pendingLabel);
}

export function getCurrentCycleMemberReply(detail: SupportHandoffStaffDetail) {
  if (
    detail.memberReply.memberReply &&
    detail.memberReply.memberReplyResponseVersion === detail.publicResponse.publicResponseVersion
  ) {
    return detail.memberReply;
  }

  return null;
}

export function getLatestMemberReply(detail: SupportHandoffStaffDetail) {
  return detail.memberReply.memberReply ? detail.memberReply : null;
}

export function StaffHandoffLifecycleTimeline({
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

export function PublicResponseAcknowledgementStatus({
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
