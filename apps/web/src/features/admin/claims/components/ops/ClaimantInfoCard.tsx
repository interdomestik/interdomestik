'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@interdomestik/ui/components/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { Building2, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { InfoPill } from '../shared/InfoPill';

interface ClaimantInfoCardProps {
  memberName: string | null;
  memberEmail: string | null;
  memberNumber?: string | null;
  branchCode: string | null;
  claimAmount: string | number | null;
}

export function ClaimantInfoCard({
  memberName,
  memberEmail,
  memberNumber,
  branchCode,
  claimAmount,
}: ClaimantInfoCardProps) {
  const t = useTranslations('agent.details');
  const tDetail = useTranslations('admin.claims_page.detail');

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
          {t('claimantInfo')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* User Identity Row */}
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border">
            <AvatarImage src={memberEmail || ''} />
            <AvatarFallback className="bg-primary/10 text-primary font-bold">
              {memberName?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="overflow-hidden space-y-0.5">
            <div className="font-semibold text-sm truncate leading-none">{memberName}</div>
            <div className="text-xs text-muted-foreground truncate font-mono">{memberEmail}</div>
            {memberNumber && (
              <div className="text-[10px] text-amber-700/80 font-mono bg-amber-50 inline-block px-1 rounded border border-amber-200/50 mt-0.5">
                {memberNumber}
              </div>
            )}
          </div>
        </div>

        {/* Data Pills Row */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between group rounded-md border border-transparent hover:bg-muted/50 transition-colors p-1 -mx-1">
            <span className="text-xs text-muted-foreground font-medium pl-1">
              {tDetail('fields.branch')}
            </span>
            <InfoPill
              icon={Building2}
              value={branchCode || '—'}
              variant="premium"
              className="bg-slate-50 border-slate-200 text-slate-700"
              separatorClassName="bg-slate-300"
            />
          </div>

          <div className="flex items-center justify-between group rounded-md border border-transparent hover:bg-muted/50 transition-colors p-1 -mx-1">
            <span className="text-xs text-muted-foreground font-medium pl-1">
              {tDetail('fields.claim_limit')}
            </span>
            {claimAmount ? (
              <InfoPill
                icon={Wallet}
                value={typeof claimAmount === 'number' ? `€${claimAmount.toFixed(2)}` : claimAmount}
                variant="premium"
                className="bg-emerald-50 border-emerald-200 text-emerald-700"
                separatorClassName="bg-emerald-300"
              />
            ) : (
              <span className="text-xs text-muted-foreground font-mono pr-2">—</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
