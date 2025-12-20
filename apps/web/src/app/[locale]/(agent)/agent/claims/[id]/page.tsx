import { ClaimDetailHeader } from '@/components/agent/claim-detail-header';
import { ClaimDocumentsPane } from '@/components/agent/claim-documents-pane';
import { ClaimInfoPane } from '@/components/agent/claim-info-pane';
import { MessagingPanel } from '@/components/messaging/messaging-panel';
import { auth } from '@/lib/auth';
import { claimDocuments, claimMessages, claims, db } from '@interdomestik/database';
import { desc, eq } from 'drizzle-orm';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

async function getClaimDetails(id: string) {
  return await db.query.claims.findFirst({
    where: eq(claims.id, id),
    with: {
      user: true,
    },
  });
}

export default async function AgentClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return notFound();
  if (session.user.role !== 'staff' && session.user.role !== 'admin') return notFound();

  const data = await getClaimDetails(id);
  if (!data) return notFound();
  if (session.user.role === 'staff' && data.staffId !== session.user.id) return notFound();

  // Fetch messages
  const messages = await db.query.claimMessages.findMany({
    where: eq(claimMessages.claimId, id),
    orderBy: [desc(claimMessages.createdAt)],
    with: { sender: true },
  });

  // Fetch documents
  const documents = await db.query.claimDocuments.findMany({
    where: eq(claimDocuments.claimId, id),
    orderBy: [desc(claimDocuments.createdAt)],
  });

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <ClaimDetailHeader claim={data} />

      {/* 3-Pane Cockpit Layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        <ClaimInfoPane claim={data} />
        <MessagingPanel
          claimId={id}
          currentUserId={session.user.id}
          isAgent={true}
          initialMessages={messages.map(message => ({
            id: message.id,
            claimId: message.claimId,
            senderId: message.senderId,
            content: message.content,
            isInternal: message.isInternal ?? false,
            readAt: message.readAt,
            createdAt: message.createdAt ?? new Date(),
            sender: {
              id: message.sender?.id ?? message.senderId,
              name: message.sender?.name ?? 'Unknown',
              image: message.sender?.image ?? null,
              role: message.sender?.role ?? 'user',
            },
          }))}
        />
        <ClaimDocumentsPane documents={documents} />
      </div>
    </div>
  );
}
