import { OpsAction, OpsDocument, OpsTimelineEvent } from '../types';
import { toOpsBadgeVariant } from './status';

type DbDocument = {
  id: string;
  fileName: string;
  storagePath: string;
  uploadedAt: Date;
};

type SubscriptionLike = {
  id: string;
  status: string | null;
  createdAt: Date | null;
  currentPeriodEnd: Date | null;
  canceledAt?: Date | null;
  cancelAtPeriodEnd?: boolean | null;
};

export type OpsActionConfig = Omit<OpsAction, 'onClick'> & { id: string };

export function toOpsStatus(status: string | null | undefined) {
  const safeStatus = status || 'none';
  return {
    label: safeStatus.replace(/_/g, ' ').toUpperCase(),
    variant: toOpsBadgeVariant(safeStatus),
    status: safeStatus,
  };
}

export function toOpsDocuments(docs: DbDocument[] | undefined): OpsDocument[] {
  if (!docs || !Array.isArray(docs)) return [];
  return docs.map(d => ({
    id: d.id,
    name: d.fileName,
    url: '#', // TODO: Implement secure download link generation
    uploadedAt: d.uploadedAt,
  }));
}

export function toOpsTimelineEvents(sub: SubscriptionLike | undefined): OpsTimelineEvent[] {
  if (!sub) return [];

  const events: OpsTimelineEvent[] = [];

  // Creation event
  if (sub.createdAt) {
    events.push({
      id: `${sub.id}-created`,
      title: 'Membership Created',
      description: 'Initial subscription created',
      date: new Date(sub.createdAt).toLocaleString(),
      tone: 'neutral',
    });
  }

  // Renewal/Expirations
  if (sub.currentPeriodEnd) {
    const isPast = new Date(sub.currentPeriodEnd) < new Date();
    const title = isPast ? 'Period Ended' : 'Renews On';
    events.push({
      id: `${sub.id}-cycle`,
      title,
      description: `Period end date`,
      date: new Date(sub.currentPeriodEnd).toLocaleString(),
      tone: isPast ? 'warning' : 'neutral',
    });
  }

  // Cancellation
  if (sub.canceledAt) {
    events.push({
      id: `${sub.id}-canceled`,
      title: 'Canceled',
      description: 'Membership canceled',
      date: new Date(sub.canceledAt).toLocaleString(),
      tone: 'danger',
    });
  }

  // Sort detailed timeline (newest first)
  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getMembershipActions(
  sub: SubscriptionLike | undefined,
  _t: (key: string) => string
): { primary?: OpsActionConfig; secondary: OpsActionConfig[] } {
  if (!sub) return { secondary: [] };

  const secondary: OpsActionConfig[] = [];
  let primary: OpsActionConfig | undefined;

  const now = new Date();
  const currentPeriodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const isPastDue = sub.status === 'past_due';
  const isActive = sub.status === 'active';
  const daysToRenewal = currentPeriodEnd
    ? Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  // 10B SAFE actions
  // If status === 'past_due' => show primary "Update payment method"
  if (isPastDue) {
    primary = {
      id: 'update_payment',
      label: 'Update Payment Method',
      variant: 'default',
    };
  } else if (isActive && daysToRenewal <= 30 && daysToRenewal >= 0) {
    // If within 30 days of currentPeriodEnd AND active => show "Renew"
    primary = {
      id: 'renew',
      label: 'Renew',
      variant: 'default',
    };
  }

  // Cancellation: show "Request cancellation"
  // Should allow cancellation if not already canceled
  if ((isActive || isPastDue) && !sub.canceledAt && !sub.cancelAtPeriodEnd) {
    secondary.push({
      id: 'cancel',
      label: 'Request Cancellation',
      variant: 'destructive',
    });
  }

  return { primary, secondary };
}
