'use client';

import { getMemberReferralLink, getMemberReferralStats } from '@/actions/member-referrals';
import { Button } from '@interdomestik/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui/components/card';
import { Input } from '@interdomestik/ui/components/input';
import { Skeleton } from '@interdomestik/ui/components/skeleton';
import { Check, Copy, Gift, MessageCircle, Share2, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface ReferralData {
  code: string;
  link: string;
  whatsappShareUrl: string;
}

interface ReferralStats {
  totalReferred: number;
  pendingRewards: number;
  paidRewards: number;
  rewardsCurrency: string;
}

export function ReferralCard() {
  const t = useTranslations('dashboard.referral');
  const [data, setData] = useState<ReferralData | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [linkResult, statsResult] = await Promise.all([
          getMemberReferralLink(),
          getMemberReferralStats(),
        ]);

        if (linkResult.success) setData(linkResult.data);
        if (statsResult.success) setStats(statsResult.data);
      } catch (error) {
        console.error('Failed to load referral data:', error);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const handleCopy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.link);
      setIsCopied(true);
      toast.success(t('copied'));
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error(t('copyError'));
    }
  };

  const handleWhatsAppShare = () => {
    if (!data) return;
    window.open(data.whatsappShareUrl, '_blank');
  };

  const handleNativeShare = async () => {
    if (!data) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: t('shareTitle'),
          text: t('shareText'),
          url: data.link,
        });
      } catch {
        // User cancelled
      }
    } else {
      handleCopy();
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Gift className="h-5 w-5 text-primary" />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Row */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 p-3 bg-muted/50 rounded-lg">
            <div className="text-center">
              <div className="flex items-center justify-center text-primary">
                <Users className="h-4 w-4 mr-1" />
                <span className="text-lg font-bold">{stats.totalReferred}</span>
              </div>
              <div className="text-xs text-muted-foreground">{t('friends')}</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-amber-600">
                €{stats.pendingRewards.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">{t('pending')}</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">
                €{stats.paidRewards.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">{t('earned')}</div>
            </div>
          </div>
        )}

        {/* Link Input */}
        <div className="flex gap-2">
          <Input
            value={data.link}
            readOnly
            className="font-mono text-sm bg-muted/50"
            onClick={e => e.currentTarget.select()}
          />
          <Button size="icon" variant="outline" onClick={handleCopy}>
            {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        {/* Share Buttons */}
        <div className="flex gap-2">
          <Button
            variant="default"
            className="flex-1 bg-green-600 hover:bg-green-700"
            onClick={handleWhatsAppShare}
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            WhatsApp
          </Button>
          <Button variant="outline" className="flex-1" onClick={handleNativeShare}>
            <Share2 className="h-4 w-4 mr-2" />
            {t('share')}
          </Button>
        </div>

        {/* Reward Info */}
        <p className="text-xs text-muted-foreground text-center">{t('rewardInfo')}</p>
      </CardContent>
    </Card>
  );
}
