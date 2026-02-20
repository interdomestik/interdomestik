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
import { format } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
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
  currentUser: {
    id: string;
    name: string;
    image: string | null;
    role: string;
  };
}

export function AgentClaimsProPage({ claims, currentUser }: AgentClaimsProPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL Selection for Drawer
  const selectedId = getSelectedClaimId(searchParams);
  // Drawer View Mode
  const [viewMode, setViewMode] = useState<'details' | 'messaging'>('details');

  const handleSelect = (id: string) => {
    setViewMode('details'); // Reset view on new selection
    const params = new URLSearchParams(searchParams);
    params.set('selected', id);
    params.delete('claimId');
    router.replace(`?${params.toString()}`);
  };

  const handleClose = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('selected');
    params.delete('claimId');
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
    { key: 'claim', header: 'Claim' },
    { key: 'status', header: 'Status' },
    { key: 'member', header: 'Member' },
    { key: 'meta', header: 'Created / Last Update' },
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
        label={claim.status}
        variant={toOpsBadgeVariant(claim.status)}
      />,
      // Member
      <div key="member">
        <div className="font-medium">{claim.member?.name || 'Unknown'}</div>
        <div className="text-xs text-muted-foreground">{claim.member?.email}</div>
      </div>,
      // Meta
      <div key="meta" className="text-xs text-muted-foreground">
        <div>{format(new Date(claim.createdAt), 'MMM d, yyyy')}</div>
        <div className="opacity-70">Upd: {format(new Date(claim.updatedAt), 'MMM d')}</div>
      </div>,
    ],
    onClick: () => handleSelect(claim.id),
    testId: 'claim-row',
  }));

  const selectedClaim = claims.find(c => c.id === selectedId);
  const requestedClaimId = selectedId ?? undefined;
  const claimNotAccessible = !!requestedClaimId && !selectedClaim;

  // Actions Logic
  const actions = useMemo(() => {
    if (!selectedClaim) return { secondary: [] };

    // Use adapter to get standard actions (including message)
    const available = getClaimActions(selectedClaim, k => k); // Mock t function

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
  }, [selectedClaim]);

  // Drawer Footer (Only show when in details mode?)
  // Actually OpsActionBar usually lives in the body or footer.
  // OpsDrawer has a `footer` prop. Let's put OpsActionBar there for Details mode.

  return (
    <div className="space-y-6" data-testid="agent-claims-pro-page">
      {selectedClaim && (
        <span className="sr-only" data-testid="workspace-selected-claim-id">
          {selectedClaim.id}
        </span>
      )}
      {claimNotAccessible && (
        <span className="sr-only" data-testid="workspace-claim-not-accessible">
          Claim is not accessible
        </span>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Claims Worklist (Pro)</h1>
          <p className="text-muted-foreground">Monitor and track member claims.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/agent/workspace">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Workspace
            </Button>
          </Link>
          <Link href="/agent/members">
            <Button variant="ghost" size="sm">
              Switch to Lite
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <OpsFiltersBar
        tabs={[
          { id: 'all', label: 'All Claims' },
          { id: 'open', label: 'Open / Active' },
          { id: 'closed', label: 'Closed / Resolved' },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by Claim # or Member..."
        searchInputTestId="claims-search"
      />

      {/* Table */}
      <OpsTable columns={columns} rows={rows} emptyLabel="No claims found matching filters." />

      {/* Drawer */}
      <OpsDrawer
        open={!!selectedClaim}
        onOpenChange={open => !open && handleClose()}
        title={selectedClaim ? `Claim ${selectedClaim.claimNumber}` : ''}
        footer={
          viewMode === 'details' && selectedClaim ? (
            <OpsActionBar secondary={actions.secondary} />
          ) : undefined
        }
      >
        {selectedClaim && (
          <div className="space-y-6" data-testid="ops-drawer-content">
            {viewMode === 'details' ? (
              <div className="space-y-6">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-medium mb-2">Details (Read Only)</h3>
                  <p className="text-sm">Status: {selectedClaim.status}</p>
                  <p className="text-sm">Branch: {selectedClaim.branch?.name || 'N/A'}</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Timeline and Documents are coming soon in next update.
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium">Messages</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewMode('details')}
                    data-testid="close-messaging-view"
                  >
                    Close Messaging
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
