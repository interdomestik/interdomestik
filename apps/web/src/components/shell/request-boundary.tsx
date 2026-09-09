import { Suspense, type ReactNode } from 'react';
import { connection } from 'next/server';

type Props = Readonly<{ children: ReactNode }>;

export function RequestFallback() {
  return (
    <div role="status" aria-label="Loading page" data-testid="request-fallback">
      <div aria-hidden="true" className="min-h-screen animate-pulse bg-background">
        <div className="border-b border-border">
          <div className="mx-auto flex h-16 w-full max-w-7xl items-center px-4 sm:px-6">
            <div className="h-8 w-36 rounded bg-muted" />
          </div>
        </div>
        <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
          <div className="h-8 w-full max-w-sm rounded bg-muted" />
          <div className="h-4 w-full max-w-xl rounded bg-muted/70" />
          <div className="grid gap-6 md:grid-cols-3">
            {[0, 1, 2].map(item => (
              <div key={item} className="h-40 rounded-xl border border-border bg-muted/50" />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

async function ConnectedRequest({ children }: Props) {
  await connection();
  return children;
}

export function RequestBoundary({ children }: Props) {
  return (
    <Suspense fallback={<RequestFallback />}>
      <ConnectedRequest>{children}</ConnectedRequest>
    </Suspense>
  );
}
