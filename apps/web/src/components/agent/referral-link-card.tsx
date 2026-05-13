'use client';

import type { ActionResult, ReferralLinkResult } from '@/actions/referrals';
import { Button } from '@interdomestik/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { Input } from '@interdomestik/ui/components/input';
import { normalizePublicLink } from '@/lib/public-links';
import { AlertCircle, Check, Copy, Link as LinkIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
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

export function ReferralLinkCard({
  referralLinkResult,
}: Readonly<{
  referralLinkResult: ActionResult<ReferralLinkResult>;
}>) {
  const t = useTranslations('agent.commissions.referralLink');
  const [isCopied, setIsCopied] = useState(false);
  const link = referralLinkResult.success ? referralLinkResult.data.link : '';
  const error = referralLinkResult.success ? null : referralLinkResult.error;
  const normalizedLink = normalizePublicLink(link);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(normalizedLink);
      setIsCopied(true);
      toast.success(t('copied'));
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      if (copyTextFallback(normalizedLink)) {
        setIsCopied(true);
        toast.success(t('copied'));
        setTimeout(() => setIsCopied(false), 2000);
        return;
      }

      toast.error(t('copyError'));
    }
  };

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
