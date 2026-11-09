'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { MessagingPanel } from '@/components/messaging/messaging-panel';
import { OpsActionBar, OpsDrawer, OpsFiltersBar, OpsTable } from '@/components/ops';
import { getClaimActions } from '@/components/ops/adapters/claims';
import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui';
import { ArrowLeft } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { translateClaimStatus, useAgentClaimRows, type AgentProClaim } from './agent-claim-rows';
import { getClaimSelectionCloseHref, getSelectedClaimId } from './claim-selection';

export type { AgentProClaim } from './agent-claim-rows';

interface AgentClaimsProPageProps {
  claims: AgentProClaim[];
  selectedClaimId?: string | null;
  currentUser: {
    id: string;
    name: string;
    image: string | null;
    role: string;
  };
}

export function AgentClaimsProPage({ claims, currentUser }: Readonly<AgentClaimsProPageProps>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations('agent');
  const tClaims = useTranslations('claims');
  // URL Selection for Drawer
  const selectionParams = new URLSearchParams(searchParams.toString());
  const selectedId = getSelectedClaimId(selectionParams);
  // Drawer View Mode
  const [viewMode, setViewMode] = useState<'details' | 'messaging'>('details');

  const handleSelect = (id: string) => {
    setViewMode('details'); // Reset view on new selection
    const params = new URLSearchParams(selectionParams);
    params.delete('claimId');
    params.set('selected', id);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleClose = () => {
    const nextHref = getClaimSelectionCloseHref(selectionParams);
    if (!nextHref) {
      return;
    }

    router.replace(nextHref, { scroll: false });
  };

  // Local Filter State
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter Logic
  const filteredClaims = claims.filter(claim => {
    // 1. Tab Filter
    if (activeTab === 'open' && ['closed', 'rejected', 'resolved'].includes(claim.status))
      return false;
    if (activeTab === 'closed' && !['closed', 'rejected', 'resolved'].includes(claim.status))
      return false;

    // 2. Search Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matches =
        claim.claimNumber.toLowerCase().includes(q) ||
        claim.title.toLowerCase().includes(q) ||
        claim.member?.name.toLowerCase().includes(q) ||
        claim.member?.email.toLowerCase().includes(q);
      if (!matches) return false;
    }
    return true;
  });

  const { columns, rows } = useAgentClaimRows(filteredClaims, handleSelect);

  const selectedClaim = claims.find(c => c.id === selectedId);
  const showNotAccessibleClaimState = Boolean(selectedId) && !selectedClaim;

  const actions = useMemo(() => {
    const available = getClaimActions(selectedClaim, t);
    return {
      secondary: available.secondary.map(action => ({
        ...action,
        testId: `action-${action.id}`,
        onClick: () => {
          if (action.id === 'message') setViewMode('messaging');
          if (action.id === 'upload') console.log('Upload clicked');
        },
      })),
    };
  }, [selectedClaim, t]);

  return (
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]" data-testid="agent-claims-pro-page">
      {/* Header */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('claimsPro.title')}</h1>
          <p className="text-muted-foreground">{t('claimsPro.subtitle')}</p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          <Link href="/agent/workspace" locale={locale}>
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              {t('claimsPro.backToWorkspace')}
            </Button>
          </Link>
          <Link href="/agent/members" locale={locale}>
            <Button variant="ghost" size="sm">
              {t('claimsPro.switchToLite')}
            </Button>
          </Link>
        </div>
      </div>

      {showNotAccessibleClaimState ? (
        <div
          className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          data-testid="workspace-claim-not-accessible"
        >
          {t('claimsPro.claimNotAccessible')}
        </div>
      ) : null}

      {/* Filters */}
      <OpsFiltersBar
        tabs={[
          { id: 'all', label: t('claimsPro.tabs.all') },
          { id: 'open', label: t('claimsPro.tabs.open') },
          { id: 'closed', label: t('claimsPro.tabs.closed') },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={t('claimsPro.searchPlaceholder')}
        searchInputTestId="claims-search"
      />

      {/* Drawer */}
      <OpsDrawer
        inlineOnMobile
        selectionKey={selectedClaim?.id}
        open={!!selectedClaim}
        onOpenChange={open => !open && handleClose()}
        title={
          selectedClaim
            ? t('claimsPro.drawerTitle', { claimNumber: selectedClaim.claimNumber })
            : ''
        }
        testId="ops-drawer"
        closeLabel={t('claimsPro.closeLabel')}
        descriptionText={t('claimsPro.dialogDescription')}
        footer={
          viewMode === 'details' && selectedClaim ? (
            <OpsActionBar
              secondary={actions.secondary}
              className="[&>div]:flex-wrap [&_button]:min-h-11 [&_button]:max-w-full [&_button]:h-auto [&_button]:whitespace-normal"
            />
          ) : undefined
        }
      >
        {selectedClaim && (
          <div className="space-y-6" data-testid="ops-drawer-content">
            <p
              className="break-all text-xs text-muted-foreground"
              data-testid="workspace-selected-claim-id"
            >
              {selectedClaim.id}
            </p>
            {viewMode === 'details' ? (
              <div className="space-y-6">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-medium mb-2">{t('claimsPro.readOnlyDetails')}</h3>
                  <p className="text-sm">
                    {t('claimsPro.statusLabel')}{' '}
                    {translateClaimStatus(tClaims, selectedClaim.status)}
                  </p>
                  <p className="text-sm">
                    {t('claimsPro.branchLabel')} {selectedClaim.branch?.name || t('claimsPro.na')}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {t('claimsPro.timelineComingSoon')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="min-w-0 flex flex-col">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 mb-4">
                  <h3 className="font-medium">{t('details.messages')}</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewMode('details')}
                    data-testid="close-messaging-view"
                  >
                    {t('claimsPro.closeMessaging')}
                  </Button>
                </div>
                <MessagingPanel
                  claimId={selectedClaim.id}
                  currentUser={currentUser}
                  isAgent={true}
                  allowInternal={false}
                />
              </div>
            )}
          </div>
        )}
      </OpsDrawer>

      {/* Table */}
      <OpsTable
        columns={columns}
        rows={rows}
        emptyLabel={t('claimsPro.empty')}
        mobileCards
        scrollLabel={t('claimsPro.title')}
        containerClassName="min-w-0 max-w-full"
      />
    </div>
  );
}
