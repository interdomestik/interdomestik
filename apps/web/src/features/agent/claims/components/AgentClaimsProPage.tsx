'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { MessagingPanel } from '@/components/messaging/messaging-panel';
import {
  OpsActionBar,
  OpsDrawer,
  OpsFiltersBar,
  OpsStatusBadge,
  OpsTable,
  toOpsBadgeVariant,
} from '@/components/ops';
import { getClaimActions } from '@/components/ops/adapters/claims';
import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui';
import { ArrowLeft } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { getSelectedClaimId } from './claim-selection';

// Define minimal Claim type for Pro table
export type AgentProClaim = {
  id: string;
  title: string;
  claimNumber: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  member: {
    id: string;
    name: string;
    email: string;
  } | null;
  branch: {
    name: string;
  } | null;
  unreadCount?: number;
  lastMessage?: string | null;
  _count?: {
    documents: number;
    timelineEvents: number;
  };
};

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

export function AgentClaimsProPage({
  claims,
  selectedClaimId,
  currentUser,
}: AgentClaimsProPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations('agent');
  const tClaims = useTranslations('claims');
  const formatDate = useMemo(
    () =>
      new Intl.DateTimeFormat(resolveDateLocale(locale), {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
      }),
    [locale]
  );
  const formatShortDate = useMemo(
    () =>
      new Intl.DateTimeFormat(resolveDateLocale(locale), {
        day: 'numeric',
        month: 'numeric',
      }),
    [locale]
  );

  // URL Selection for Drawer
  const selectedId = (selectedClaimId?.trim() || getSelectedClaimId(searchParams)) ?? null;
  // Drawer View Mode
  const [viewMode, setViewMode] = useState<'details' | 'messaging'>('details');

  const handleSelect = (id: string) => {
    setViewMode('details'); // Reset view on new selection
    const params = new URLSearchParams(searchParams);
    params.set('selected', id);
    router.replace(`?${params.toString()}`);
  };

  const handleClose = () => {
    if (!searchParams.has('selected')) {
      return;
    }

    const params = new URLSearchParams(searchParams);
    params.delete('selected');
    router.replace(`?${params.toString()}`);
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

  // Table Configuration
  const columns = [
    { key: 'claim', header: t('claimsPro.columns.claim') },
    { key: 'status', header: t('claimsPro.columns.status') },
    { key: 'member', header: t('claimsPro.columns.member') },
    { key: 'meta', header: t('claimsPro.columns.meta') },
  ];

  const rows = filteredClaims.map(claim => ({
    id: claim.id,
    cells: [
      // Claim
      <div key="claim">
        <div className="font-medium flex items-center gap-2">
          {claim.claimNumber}
          {claim.unreadCount && claim.unreadCount > 0 && (
            <span
              className="flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-destructive rounded-full"
              data-testid={`unread-badge-${claim.id}`}
            >
              {claim.unreadCount}
            </span>
          )}
        </div>
        <div className="text-sm text-foreground/90 truncate w-48 font-medium" title={claim.title}>
          {claim.title}
        </div>
        <div className="text-xs text-muted-foreground w-48 truncate">
          {claim.lastMessage ? (
            <span className="text-foreground/80 font-medium">
              &quot;{claim.lastMessage.slice(0, 30)}
              {claim.lastMessage.length > 30 ? '...' : ''}&quot;
            </span>
          ) : (
            `ID: ${claim.id.slice(0, 8)}`
          )}
        </div>
      </div>,
      // Status
      <OpsStatusBadge
        key="status"
        label={translateClaimStatus(tClaims, claim.status)}
        variant={toOpsBadgeVariant(claim.status)}
      />,
      // Member
      <div key="member">
        <div className="font-medium">{claim.member?.name || t('claimsPro.unknownMember')}</div>
        <div className="text-xs text-muted-foreground">{claim.member?.email}</div>
      </div>,
      // Meta
      <div key="meta" className="text-xs text-muted-foreground">
        <div>{formatDate.format(new Date(claim.createdAt))}</div>
        <div className="opacity-70">
          {t('claimsPro.updatedPrefix')} {formatShortDate.format(new Date(claim.updatedAt))}
        </div>
      </div>,
    ],
    onClick: () => handleSelect(claim.id),
    testId: 'claim-row',
  }));

  const selectedClaim = claims.find(c => c.id === selectedId);
  const showNotAccessibleClaimState = Boolean(selectedId) && !selectedClaim;

  // Actions Logic
  const actions = useMemo(() => {
    if (!selectedClaim) return { secondary: [] };

    // Use adapter to get standard actions (including message)
    const available = getClaimActions(selectedClaim, t);

    return {
      secondary: available.secondary.map(action => ({
        ...action,
        testId: `action-${action.id}`,
        onClick:
          action.id === 'message'
            ? () => setViewMode('messaging')
            : action.id === 'upload'
              ? () => console.log('Upload clicked')
              : () => {},
      })),
    };
  }, [selectedClaim, t]);

  // Drawer Footer (Only show when in details mode?)
  // Actually OpsActionBar usually lives in the body or footer.
  // OpsDrawer has a `footer` prop. Let's put OpsActionBar there for Details mode.

  return (
    <div className="space-y-6" data-testid="agent-claims-pro-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('claimsPro.title')}</h1>
          <p className="text-muted-foreground">{t('claimsPro.subtitle')}</p>
        </div>
        <div className="flex gap-2">
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

      {/* Table */}
      <OpsTable columns={columns} rows={rows} emptyLabel={t('claimsPro.empty')} />

      {/* Drawer */}
      <OpsDrawer
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
            <OpsActionBar secondary={actions.secondary} />
          ) : undefined
        }
      >
        {selectedClaim && (
          <div className="space-y-6" data-testid="ops-drawer-content">
            <p className="text-xs text-muted-foreground" data-testid="workspace-selected-claim-id">
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
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
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
                />
              </div>
            )}
          </div>
        )}
      </OpsDrawer>
    </div>
  );
}

function resolveDateLocale(locale: string): string {
  switch (locale) {
    case 'mk':
      return 'mk-MK';
    case 'sq':
      return 'sq-AL';
    case 'sr':
      return 'sr-RS';
    default:
      return locale;
  }
}

function translateClaimStatus(
  tClaims: ReturnType<typeof useTranslations<'claims'>>,
  status: string
): string {
  try {
    return tClaims(`status.${status}`);
  } catch {
    return status;
  }
}
