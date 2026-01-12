import { useTranslations } from 'next-intl';
import React, { Fragment } from 'react';

import type { ClaimOriginType } from '../../types';

interface ClaimSourceStripProps {
  originType: ClaimOriginType;
  originDisplayName: string | null;
  branchCode: string | null;
  memberId?: string; // Optional: Link to member profile if needed
  memberDisplayName: string;
}

export function ClaimSourceStrip({
  originType,
  originDisplayName,
  branchCode,
  memberDisplayName,
}: ClaimSourceStripProps) {
  const t = useTranslations('admin.claims_page.source');

  // Build list of valid segments
  const items: React.ReactNode[] = [
    // 1. Origin
    <span key="origin" className="flex items-center gap-1">
      <span className="font-medium text-foreground">{t('origin_label')}:</span>
      <span>{t(`origin.${originType}`)}</span>
    </span>,
  ];

  // 2. Branch (Conditional)
  if (branchCode) {
    items.push(
      <span key="branch" className="flex items-center gap-1">
        <span className="font-medium text-foreground">{t('branch')}:</span>
        <span>{branchCode}</span>
      </span>
    );
  }

  // 3. Agent (Conditional)
  if (originType === 'agent') {
    items.push(
      <span key="agent" className="flex items-center gap-1">
        <span className="font-medium text-foreground">{t('agent')}:</span>
        <span>{originDisplayName || t('unknown')}</span>
      </span>
    );
  }

  // 4. Member (Always last)
  items.push(
    <span key="member" className="flex items-center gap-1">
      <span className="font-medium text-foreground">{t('member')}:</span>
      <span className="hover:underline cursor-pointer text-primary">{memberDisplayName}</span>
    </span>
  );

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
      {items.map((item, index) => (
        <Fragment key={index}>
          {item}
          {index < items.length - 1 && <span className="text-muted-foreground/40">•</span>}
        </Fragment>
      ))}
    </div>
  );
}
