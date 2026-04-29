import { OpsAction, OpsDocument, OpsTimelineEvent } from '../types';
import { toOpsBadgeVariant } from './status';

export type OpsActionConfig = Omit<OpsAction, 'onClick'> & { id: string };

type OpsDocumentInput = {
  id?: string;
  fileName?: string | null;
  name?: string | null;
  createdAt?: string | Date | null;
};

type LeadOpsInput = {
  id?: string;
  status?: string | null;
  source?: string | null;
  createdAt?: string | Date | null;
};

export function toOpsStatus(status: string | null | undefined) {
  const safeStatus = status || 'none';
  // Simple mapping, can be expanded
  return {
    label: safeStatus.replace(/_/g, ' ').toUpperCase(),
    variant: toOpsBadgeVariant(safeStatus),
  };
}

export function toOpsDocuments(docs: OpsDocumentInput[] | undefined): OpsDocument[] {
  // Placeholder for now as leads might not have docs yet
  if (!docs || !Array.isArray(docs)) return [];
  return docs.map(d => ({
    id: d.id ?? '',
    name: d.fileName || 'Document',
    url: '#',
    uploadedAt: d.createdAt ?? undefined,
  }));
}

export function toOpsTimelineEvents(lead: LeadOpsInput | undefined): OpsTimelineEvent[] {
  if (!lead) return [];
  const events: OpsTimelineEvent[] = [];

  // Created
  if (lead.createdAt) {
    events.push({
      id: `${lead.id}-created`,
      title: 'Lead Created',
      description: `Source: ${lead.source || 'Unknown'}`,
      date: new Date(lead.createdAt).toLocaleString(),
      tone: 'neutral',
    });
  }

  // Status check (naive for now as we don't have history in MVP lead object)
  // If converted, we assume an event
  if (lead.status === 'converted') {
    events.push({
      id: `${lead.id}-converted`,
      title: 'Converted',
      description: 'Lead converted to client',
      date: new Date().toLocaleString(), // Mock date as we don't have convertedAt in DTO yet
      tone: 'success',
    });
  }

  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getLeadActions(lead: LeadOpsInput | undefined): {
  primary?: OpsActionConfig;
  secondary: OpsActionConfig[];
} {
  if (!lead) return { secondary: [] };

  const secondary: OpsActionConfig[] = [];
  let primary: OpsActionConfig | undefined;

  const isConverted = lead.status === 'converted';
  const isLost = lead.status === 'lost';

  // Primary: Convert
  if (!isConverted) {
    primary = {
      id: 'convert',
      label: 'Convert to Client',
      variant: 'default',
      disabled: isLost,
    };
  }

  // Secondary: Mark Contacted
  if (lead.status === 'new') {
    secondary.push({
      id: 'mark_contacted',
      label: 'Mark Contacted',
      variant: 'outline',
    });
  }

  // Secondary: Advance to Payment/Qualified
  if (!isConverted && ['new', 'contacted'].includes(lead.status ?? '')) {
    secondary.push({
      id: 'pay_cash',
      label: 'Pay Cash',
      variant: 'outline',
      testId: 'pay-cash-button',
    });
  }

  // Secondary: Mark Lost
  if (!isLost && !isConverted && lead.status !== 'expired') {
    secondary.push({
      id: 'mark_lost',
      label: 'Mark Lost',
      variant: 'destructive',
    });
  }

  return { primary, secondary };
}
