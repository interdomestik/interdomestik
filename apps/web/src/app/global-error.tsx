'use client';

import { Button } from '@interdomestik/ui';
import '@interdomestik/ui/globals.css';
import { useLogger } from 'next-axiom';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const log = useLogger();

  useEffect(() => {
    log.error('Global Error Boundary', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error, log]);
  return (
    <html lang="en">
      <body className="antialiased font-sans">
        <div className="flex min-h-screen flex-col items-center justify-center text-center space-y-4 p-4 bg-background text-foreground">
          <h1 className="text-3xl font-bold">Something went wrong!</h1>
          <p className="text-muted-foreground">
            A critical error occurred. Please try refreshing the page.
          </p>
          {error?.digest && (
            <p className="text-xs text-muted-foreground bg-muted p-1 rounded">
              Ref: {error.digest}
            </p>
          )}
          <Button onClick={() => reset()}>Try again</Button>
        </div>
      </body>
    </html>
  );
}
