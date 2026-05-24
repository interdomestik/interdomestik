'use client';

import {
  getMemberReferralCardData,
  type MemberReferralCardData,
  type MemberReferralProgramSettings,
} from '@/actions/member-referrals';
import { Button } from '@interdomestik/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { Input } from '@interdomestik/ui/components/input';
import { Skeleton } from '@interdomestik/ui/components/skeleton';
import { normalizePublicLink, normalizeWhatsAppShareUrl } from '@/lib/public-links';
import { AlertCircle, Check, Copy, Gift, Share2, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface ReferralCardProps {
  isAgent?: boolean;
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
  }).format(amount);
}

function getRewardSummary(
  settings: MemberReferralProgramSettings,
  t: ReturnType<typeof useTranslations>
) {
  const rewardValue =
    settings.rewardType === 'percent'
      ? `${((settings.percentRewardBps ?? 0) / 100).toFixed(2)}%`
      : formatCurrency((settings.fixedRewardCents ?? 0) / 100, settings.currencyCode);

  const threshold = formatCurrency(settings.payoutThresholdCents / 100, settings.currencyCode);

  if (!settings.enabled) {
    return t('programDisabled');
  }

  if (settings.settlementMode === 'credit_or_payout') {
    return t('rewardInfoPayout', {
      reward: rewardValue,
      threshold,
    });
  }

  return t('rewardInfoCreditOnly', {
    reward: rewardValue,
  });
}

function normalizeReferralCardData(data: MemberReferralCardData): MemberReferralCardData {
  return {
    ...data,
    link: normalizePublicLink(data.link),
    whatsappShareUrl: normalizeWhatsAppShareUrl(data.whatsappShareUrl),
  };
}

const SKELETON_CARD_IDS = ['friends', 'pending', 'credited', 'paid'] as const;

export function ReferralCard({ isAgent: _isAgent }: Readonly<ReferralCardProps>) {
  const t = useTranslations('dashboard.referral');
  const [data, setData] = useState<MemberReferralCardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_isAgent) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    async function loadData() {
      try {
        const result = await getMemberReferralCardData();

        if (!result.success) {
          setError(t('loadError'));
          return;
        }

        setData(normalizeReferralCardData(result.data));
      } catch (loadError) {
        console.error(loadError);
        setError(t('loadError'));
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [_isAgent, t]);

  if (_isAgent) {
    return null;
  }

  const handleCopy = async () => {
    if (!data?.link) return;

    try {
      await navigator.clipboard.writeText(normalizePublicLink(data.link));
      setIsCopied(true);
      toast.success(t('copied'));
      globalThis.setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error(t('copyError'));
    }
  };

  const handleShare = () => {
    if (!data?.whatsappShareUrl) return;
    globalThis.open(
      normalizeWhatsAppShareUrl(data.whatsappShareUrl),
      '_blank',
      'noopener,noreferrer'
    );
  };

  if (isLoading) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="break-words text-sm font-medium">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {SKELETON_CARD_IDS.map(id => (
              <Skeleton key={id} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="min-w-0 border-destructive/50">
        <CardHeader>
          <CardTitle className="flex min-w-0 items-center gap-2 break-words text-sm font-medium text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {t('loadError')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="break-words text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const rewardSummary = getRewardSummary(data.settings, t);
  const currency = data.stats.rewardsCurrency || data.settings.currencyCode;

  return (
    <Card className="min-w-0">
      <CardHeader className="space-y-2">
        <CardTitle className="flex min-w-0 items-center gap-2 break-words text-base font-semibold">
          <Gift className="h-4 w-4 shrink-0 text-primary" />
          {t('title')}
        </CardTitle>
        <p className="break-words text-sm text-muted-foreground">{t('description')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <Input
            value={data.link}
            readOnly
            className="min-w-0 font-mono text-sm"
            onClick={event => event.currentTarget.select()}
          />
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleCopy}
              aria-label={t('copyAction')}
            >
              {isCopied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleShare}
              aria-label={t('shareAction')}
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0 rounded-lg border bg-muted/30 p-3">
            <p className="break-words text-xs uppercase tracking-wide text-muted-foreground">
              {t('friends')}
            </p>
            <p className="mt-2 text-2xl font-semibold">{data.stats.totalReferred}</p>
          </div>
          <div className="min-w-0 rounded-lg border bg-muted/30 p-3">
            <p className="break-words text-xs uppercase tracking-wide text-muted-foreground">
              {t('pending')}
            </p>
            <p className="mt-2 break-words text-2xl font-semibold">
              {formatCurrency(data.stats.pendingRewards, currency)}
            </p>
          </div>
          <div className="min-w-0 rounded-lg border bg-muted/30 p-3">
            <p className="break-words text-xs uppercase tracking-wide text-muted-foreground">
              {t('credited')}
            </p>
            <p className="mt-2 break-words text-2xl font-semibold">
              {formatCurrency(data.stats.creditedRewards, currency)}
            </p>
          </div>
          <div className="min-w-0 rounded-lg border bg-muted/30 p-3">
            <p className="break-words text-xs uppercase tracking-wide text-muted-foreground">
              {t('paid')}
            </p>
            <p className="mt-2 break-words text-2xl font-semibold">
              {formatCurrency(data.stats.paidRewards, currency)}
            </p>
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
          <div className="flex min-w-0 items-start gap-2">
            <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 space-y-1 break-words">
              <p>{rewardSummary}</p>
              {data.settings.settlementMode === 'credit_or_payout' ? (
                <p>
                  {t('payoutEligible', {
                    amount: formatCurrency(data.stats.payoutEligibleRewards, currency),
                  })}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
