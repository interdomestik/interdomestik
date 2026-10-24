import { AgentClientDetailV2Page } from '@/features/agent/clients/components/AgentClientDetailV2Page';
import { Suspense } from 'react';

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

// Request-specific auth is read behind this boundary so the page shell can prerender.
export default function AgentMemberProfilePage(props: Props) {
  return (
    <Suspense
      fallback={
        <output
          aria-busy="true"
          className="block space-y-8"
          data-testid="agent-member-detail-loading"
        >
          <div aria-hidden="true" className="h-24 animate-pulse rounded bg-muted" />
          <div aria-hidden="true" className="h-48 animate-pulse rounded bg-muted" />
          <div aria-hidden="true" className="h-48 animate-pulse rounded bg-muted" />
        </output>
      }
    >
      <AgentMemberProfileContent {...props} />
    </Suspense>
  );
}

async function AgentMemberProfileContent({ params }: Props) {
  const { locale, id } = await params;
  return <AgentClientDetailV2Page id={id} locale={locale} />;
}
