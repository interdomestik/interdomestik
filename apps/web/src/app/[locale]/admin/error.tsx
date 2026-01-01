'use client';

import { Button } from '@interdomestik/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui/components/card';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('common');

  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Admin Portal Error:', error);
  }, [error]);

  return (
    <div className="flex h-full min-h-[600px] w-full items-center justify-center p-4">
      <Card className="w-full max-w-md border-destructive/20 shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-xl">Admin Console Error</CardTitle>
          <CardDescription>
            An unexpected error occurred in the admin panel. The system layout is still active.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          <p className="mb-2">
            Error Digest: <span className="font-mono text-xs">{error.digest || 'Unknown'}</span>
          </p>
          <p>{error.message}</p>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button onClick={() => reset()} variant="default" className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            {t('tryAgain')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
