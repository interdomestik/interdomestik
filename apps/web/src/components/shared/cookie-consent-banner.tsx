'use client';

import { useCookieConsent } from '@/hooks/use-cookie-consent';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui';
import { Cookie } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function CookieConsentBanner() {
  const { isOpen, accept, reject } = useCookieConsent();
  const t = useTranslations('common.cookie_consent');

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm animate-in slide-in-from-bottom-5 fade-in duration-500">
      <Card className="border-primary/20 shadow-xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Cookie className="h-5 w-5 text-primary" />
            {t('title')}
          </CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('details')}</p>
        </CardContent>
        <CardFooter className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={reject}>
            {t('decline')}
          </Button>
          <Button size="sm" onClick={accept}>
            {t('accept')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
