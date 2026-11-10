'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function CommunicationRetry({
  label,
  loading,
}: Readonly<{ label: string; loading: string }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-disabled={pending}
      aria-busy={pending}
      className="mt-3 rounded border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      onClick={() => {
        if (!pending) startTransition(() => router.refresh());
      }}
    >
      <output aria-live="polite" aria-atomic="true">
        {pending ? loading : label}
      </output>
    </button>
  );
}
