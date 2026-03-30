'use client';

import { getAgentReferralLink } from '@/actions/referrals';
import { Button } from '@interdomestik/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { Input } from '@interdomestik/ui/components/input';
import { Skeleton } from '@interdomestik/ui/components/skeleton';
import { normalizePublicLink } from '@/lib/public-links';
import { AlertCircle, Check, Copy, Link as LinkIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

function copyTextFallback(value: string): boolean {
  if (typeof document === 'undefined') return false;

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export function ReferralLinkCard() {
  const t = useTranslations('agent.commissions.referralLink');
  const [link, setLink] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedLink = normalizePublicLink(link);

  useEffect(() => {
    async function loadLink() {
      try {
        const result = await getAgentReferralLink();
        if (result.success) {
          setLink(normalizePublicLink(result.data.link));
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
      await navigator.clipboard.writeText(normalizedLink);
      setIsCopied(true);
      toast.success(t('copied'));
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      if (copyTextFallback(link)) {
        setIsCopied(true);
        toast.success(t('copied'));
        setTimeout(() => setIsCopied(false), 2000);
        return;
      }

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
            value={normalizedLink}
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
