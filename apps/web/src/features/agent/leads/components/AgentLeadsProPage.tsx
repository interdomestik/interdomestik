'use client';

import { OpsActionBar } from '@/components/ops/OpsActionBar';
import { OpsDrawer } from '@/components/ops/OpsDrawer';
import { OpsFiltersBar, OpsFilterTab } from '@/components/ops/OpsFiltersBar';
import { OpsQueryState } from '@/components/ops/OpsQueryState';
import { OpsStatusBadge } from '@/components/ops/OpsStatusBadge';
import { OpsTable } from '@/components/ops/OpsTable';
import { getLeadActions, toOpsStatus, type OpsActionConfig } from '@/components/ops/adapters/leads';
import { useOpsSelectionParam } from '@/components/ops/useOpsSelectionParam';
import { Link } from '@/i18n/routing';
import { CreateLeadDialog } from './CreateLeadDialog';
import { Button } from '@interdomestik/ui';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { convertLeadToClient, updateLeadStatus } from '../actions';
import { AgentLeadTimeline, useAgentLeadRows, type AgentLeadPro } from './agent-lead-presentation';
import { LeadProfileDetails } from './LeadProfileDetails';

const LOCALIZED_STATUSES = new Set([
  'new',
  'contacted',
  'payment_pending',
  'converted',
  'lost',
  'expired',
]);

export function AgentLeadsProPage({ leads }: Readonly<{ leads: AgentLeadPro[] }>) {
  const t = useTranslations('agent.leads_pro');
  const localizeLeadStatus = (status: string | null | undefined) =>
    status && LOCALIZED_STATUSES.has(status) ? t(`statuses.${status}`) : t('statuses.none');
  const localizeActionLabel = (actionId: string, fallbackLabel: string) => {
    switch (actionId) {
      case 'convert':
        return t('actions.convert');
      case 'mark_contacted':
        return t('actions.mark_contacted');
      case 'pay_cash':
        return t('actions.pay_cash');
      case 'mark_lost':
        return t('actions.mark_lost');
      default:
        return fallbackLabel;
    }
  };
  const tabs: OpsFilterTab[] = [
    { id: 'all', label: t('tabs.all') },
    { id: 'new', label: t('tabs.new') },
    { id: 'contacted', label: t('tabs.in_progress') },
    { id: 'converted', label: t('tabs.clients') },
    { id: 'lost', label: t('tabs.lost') },
  ];
  const { selectedId, setSelectedId, clearSelectedId } = useOpsSelectionParam();
  const [isPending, startTransition] = useTransition();
  const [showSecondary, setShowSecondary] = useState(false);

  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const selectedLead = leads.find(l => l.id === selectedId);

  useEffect(() => {
    if (selectedId && leads.length > 0 && !leads.find(l => l.id === selectedId)) {
      clearSelectedId();
    }
  }, [selectedId, leads, clearSelectedId]);

  const handleRowClick = (leadId: string) => {
    setSelectedId(leadId === selectedId ? null : leadId);
  };

  const handleCloseDrawer = () => {
    clearSelectedId();
    setShowSecondary(false);
  };

  const handleAction = (id: string) => {
    if (!selectedLead) return;

    startTransition(async () => {
      try {
        if (id === 'convert') {
          await convertLeadToClient(selectedLead.id);
          toast.success(t('toasts.converted'));
        } else if (id === 'mark_contacted') {
          await updateLeadStatus(selectedLead.id, 'contacted');
          toast.success(t('toasts.marked_contacted'));
        } else if (id === 'mark_payment_pending' || id === 'pay_cash') {
          await updateLeadStatus(selectedLead.id, 'payment_pending');
          toast.success(t('toasts.payment_requested'));
        } else if (id === 'mark_lost') {
          await updateLeadStatus(selectedLead.id, 'lost');
          toast.success(t('toasts.marked_lost'));
        }
      } catch {
        toast.error(t('toasts.action_failed'));
      }
    });
  };

  const { primary, secondary } = getLeadActions(selectedLead);

  const mapAction = (config: OpsActionConfig) => ({
    ...config,
    label: localizeActionLabel(config.id, config.label),
    onClick: () => handleAction(config.id),
    disabled: isPending || config.disabled,
  });

  const filteredLeads = leads.filter(lead => {
    if (activeTab === 'new' && lead.status !== 'new') return false;
    if (activeTab === 'contacted' && !['contacted', 'payment_pending'].includes(lead.status ?? ''))
      return false;
    if (activeTab === 'converted' && lead.status !== 'converted') return false;
    if (activeTab === 'lost' && lead.status !== 'lost') return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matches =
        lead.firstName?.toLowerCase().includes(q) ||
        lead.lastName?.toLowerCase().includes(q) ||
        lead.email?.toLowerCase().includes(q) ||
        lead.phone?.includes(q);
      if (!matches) return false;
    }

    return true;
  });

  const { columns, tableRows } = useAgentLeadRows(
    filteredLeads,
    handleRowClick,
    localizeLeadStatus
  );

  return (
    <div
      className="min-w-0 flex flex-col space-y-4 [overflow-wrap:anywhere]"
      data-testid="agent-leads-pro"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/agent/members">
            <Button
              variant="ghost"
              size="icon"
              className="size-11 shrink-0"
              data-testid="agent-pro-back-button"
              aria-label={t('back_to_members')}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">{t('back_to_members')}</span>
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>
        </div>
        <CreateLeadDialog />
      </div>

      <OpsFiltersBar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={t('search_placeholder')}
        searchInputTestId="leads-pro-search"
      />

      <div className="min-w-0 max-w-full flex-1 rounded-lg">
        <OpsQueryState
          isEmpty={filteredLeads.length === 0}
          emptyTitle={t('empty_title')}
          emptySubtitle={t('empty_subtitle')}
        >
          <OpsTable
            mobileCards
            scrollLabel={t('title')}
            containerClassName="min-w-0 max-w-full"
            columns={columns}
            rows={tableRows}
            emptyLabel={t('empty_label')}
            rowTestId="lead-row"
          />
        </OpsQueryState>
      </div>

      <OpsDrawer
        open={!!selectedId}
        onOpenChange={open => !open && handleCloseDrawer()}
        title={selectedLead ? `${selectedLead.firstName} ${selectedLead.lastName}` : t('details')}
      >
        {selectedLead && (
          <div className="space-y-6">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{t('fields.status')}</p>
                <OpsStatusBadge
                  {...toOpsStatus(selectedLead.status)}
                  label={localizeLeadStatus(selectedLead.status)}
                />
              </div>
              <div className="text-right space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{t('fields.created')}</p>
                <span className="text-sm" data-testid="lead-created-at">
                  {selectedLead.createdAt
                    ? new Date(selectedLead.createdAt).toLocaleDateString()
                    : '-'}
                </span>
              </div>
            </div>

            <LeadProfileDetails lead={selectedLead} />

            {selectedLead.notes && (
              <div className="border-t pt-4">
                <span className="block text-sm font-medium text-muted-foreground mb-2">
                  {t('fields.notes')}
                </span>
                <p className="text-sm bg-muted/50 p-3 rounded-md">{selectedLead.notes}</p>
              </div>
            )}

            {primary && (
              <div className="border-t pt-4" data-testid="agent-lead-next-step">
                <span className="block text-sm font-medium text-muted-foreground mb-3">
                  {t('fields.next_step')}
                </span>
                <OpsActionBar
                  primary={mapAction(primary)}
                  className="pt-0 border-0 mt-0 [&>div]:flex-wrap [&_button]:min-h-11 [&_button]:h-auto [&_button]:max-w-full [&_button]:whitespace-normal"
                  align="start"
                />
              </div>
            )}

            {secondary.length > 0 && (
              <div className="border-t pt-4">
                <button
                  onClick={() => setShowSecondary(!showSecondary)}
                  className="flex min-h-11 items-center justify-between w-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('more_actions')}
                  {showSecondary ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {showSecondary && (
                  <div className="mt-4 animate-in slide-in-from-top-2 duration-200">
                    <OpsActionBar
                      secondary={secondary.map(mapAction)}
                      className="pt-0 border-0 mt-0 [&>div]:flex-wrap [&_button]:min-h-11 [&_button]:h-auto [&_button]:max-w-full [&_button]:whitespace-normal"
                      align="start"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="border-t pt-4">
              <AgentLeadTimeline lead={selectedLead} />
            </div>
          </div>
        )}
      </OpsDrawer>
    </div>
  );
}
