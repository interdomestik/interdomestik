'use client';

import { getAgentReferralLink } from '@/actions/referrals';
import { Button } from '@interdomestik/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { Input } from '@interdomestik/ui/components/input';
import { Skeleton } from '@interdomestik/ui/components/skeleton';
import { AlertCircle, Check, Copy, Link as LinkIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export function ReferralLinkCard() {
  const t = useTranslations('agent.commissions.referralLink');
  const [link, setLink] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLink() {
      try {
        const result = await getAgentReferralLink();
        if (result.success) {
          setLink(result.data.link);
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(t('loadError'));
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    loadLink();
  }, [t]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setIsCopied(true);
      toast.success(t('copied'));
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error(t('copyError'));
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {t('loadError')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <LinkIcon className="h-4 w-4" />
          {t('title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={link}
            readOnly
            className="font-mono text-sm bg-muted/50"
            onClick={e => e.currentTarget.select()}
          />
          <Button size="icon" variant="outline" onClick={handleCopy}>
            {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('description')}</p>
      </CardContent>
    </Card>
  );
}
