'use client';

import { Button } from '@interdomestik/ui/components/button';
import { AlertCircle, Home, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('common');

  useEffect(() => {
    console.error('Dashboard Error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 space-y-6 text-center">
      <div className="p-4 rounded-full bg-red-50 text-red-600 dark:bg-red-900/20">
        <AlertCircle className="w-10 h-10" />
      </div>

      <div className="space-y-2 max-w-md">
        <h2 className="text-2xl font-bold tracking-tight">Something went wrong</h2>
        <p className="text-muted-foreground text-sm">
          We encountered an issue loading your dashboard. Your account data is safe, but this view
          cannot be displayed right now.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <Button onClick={() => reset()} variant="secondary" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          {t('tryAgain')}
        </Button>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/">
            <Home className="w-4 h-4" />
            Return Home
          </Link>
        </Button>
      </div>

      {process.env.NODE_ENV === 'development' && (
        <div className="mt-8 p-4 bg-muted/50 rounded-lg max-w-lg w-full overflow-auto text-left">
          <p className="font-mono text-xs text-destructive">{error.message}</p>
        </div>
      )}
    </div>
  );
}
