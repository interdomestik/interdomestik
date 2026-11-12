'use client';

import { OpsStatusBadge, toOpsBadgeVariant } from '@/components/ops';
import { useLocale, useTranslations } from 'next-intl';
import { formatPilotDate } from '@/lib/utils/date';

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

export function useAgentClaimRows(claims: AgentProClaim[], onSelect: (id: string) => void) {
  const locale = useLocale();
  const t = useTranslations('agent');
  const tClaims = useTranslations('claims');
  const columns = [
    { key: 'claim', header: t('claimsPro.columns.claim') },
    { key: 'status', header: t('claimsPro.columns.status') },
    { key: 'member', header: t('claimsPro.columns.member') },
    { key: 'meta', header: t('claimsPro.columns.meta') },
  ];

  const rows = claims.map(claim => ({
    id: claim.id,
    cells: [
      // Claim
      <div key="claim">
        <div className="font-medium flex items-center gap-2">
          {claim.claimNumber}
          {Boolean(claim.unreadCount && claim.unreadCount > 0) && (
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
        <div>{formatPilotDate(claim.createdAt, locale, '-')}</div>
        <div className="opacity-70">
          {t('claimsPro.updatedPrefix')} {formatPilotDate(claim.updatedAt, locale, '-')}
        </div>
      </div>,
    ],
    onClick: () => onSelect(claim.id),
    testId: 'claim-row',
  }));

  return { columns, rows };
}

export function translateClaimStatus(
  tClaims: ReturnType<typeof useTranslations<'claims'>>,
  status: string
): string {
  try {
    return tClaims(`status.${status}`);
  } catch {
    return status;
  }
}
