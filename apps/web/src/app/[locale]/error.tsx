'use client';

import { Button } from '@interdomestik/ui/components/button';
import Link from 'next/link';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('[Global Error]', error);
  }, [error]);

  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center text-center space-y-4"
      data-testid="error-page"
    >
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-destructive font-bold">Error</p>
        <h1 className="text-3xl font-bold">Something went wrong!</h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          An unexpected error occurred while rendering this page.
          {error.digest && (
            <span className="block mt-2 text-xs opacity-50">Digest: {error.digest}</span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={() => reset()} variant="default">
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Back to Home</Link>
        </Button>
      </div>
    </div>
  );
}
