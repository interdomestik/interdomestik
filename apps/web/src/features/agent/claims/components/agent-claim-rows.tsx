'use client';

import { OpsStatusBadge, toOpsBadgeVariant } from '@/components/ops';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';

// Define minimal Claim type for Pro table
export type AgentProClaim = {
  id: string;
  title: string;
  claimNumber: string | null;
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
          {claim.claimNumber?.trim() || claim.title}
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
        {claim.lastMessage ? (
          <div className="text-xs text-muted-foreground w-48 truncate">
            <span className="text-foreground/80 font-medium">
              &quot;{claim.lastMessage.slice(0, 30)}
              {claim.lastMessage.length > 30 ? '...' : ''}&quot;
            </span>
          </div>
        ) : null}
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
    onClick: () => onSelect(claim.id),
    testId: 'claim-row',
  }));

  return { columns, rows };
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
