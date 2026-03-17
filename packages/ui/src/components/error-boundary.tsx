'use client';

import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { ErrorBoundary as ReactErrorBoundary, type FallbackProps } from 'react-error-boundary';

import { Button } from './button';
import { Card, CardContent, CardHeader, CardTitle } from './card';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unknown error';
}

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <Card className="border-destructive/50 bg-destructive/5 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-destructive flex items-center gap-2 text-base">
          <AlertTriangle className="h-5 w-5" />
          Component Failed
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Something went wrong in this section.
          <br />
          <span className="font-mono text-xs opacity-70">{getErrorMessage(error)}</span>
        </p>
        <Button variant="outline" size="sm" onClick={resetErrorBoundary} className="gap-2">
          <RefreshCcw className="h-4 w-4" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ReactErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        // Retry logic could go here
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
}
