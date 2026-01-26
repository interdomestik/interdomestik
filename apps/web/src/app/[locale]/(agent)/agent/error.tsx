'use client';

import { Button } from '@interdomestik/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

export default function AgentError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  const t = useTranslations('common');

  useEffect(() => {
    console.error('Agent Portal Error:', error);
  }, [error]);

  return (
    <div className="container max-w-4xl py-12" data-testid="agent-portal-error">
      <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-900/10">
        <CardHeader className="flex flex-row items-center gap-4 pb-2">
          <div className="p-2 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold text-amber-900 dark:text-amber-100">
              Agent Portal Issue
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            We couldn't load the requested agent data. This might be a temporary connectivity issue
            or a permission error.
          </p>

          <div className="flex items-center gap-4 pt-2">
            <Button
              onClick={() => reset()}
              variant="outline"
              className="border-amber-200 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-800 dark:hover:bg-amber-900"
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              {t('tryAgain')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
