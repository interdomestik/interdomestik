'use client';

/**
 * Branch Dashboard Error Boundary
 * Catches client-side errors and reports to Sentry
 */

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

import { Button } from '@interdomestik/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui/components/card';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function BranchDashboardError({ error, reset }: ErrorProps) {
  const t = useTranslations('admin.errors.branch_dashboard');

  useEffect(() => {
    // Report to Sentry with branch dashboard context
    Sentry.captureException(error, {
      tags: {
        feature: 'branch_dashboard',
        errorBoundary: 'true',
      },
      extra: {
        digest: error.digest,
      },
    });
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Card className="max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button onClick={reset} variant="outline">
            {t('try_again')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
