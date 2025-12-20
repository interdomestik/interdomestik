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
  if (
    session.user.role !== 'staff' &&
    session.user.role !== 'admin' &&
    session.user.role !== 'agent'
  )
    return notFound();

  const data = await getClaimDetails(id);
  if (!data) return notFound();

  // Access control
  if (session.user.role === 'staff' && data.staffId !== session.user.id) return notFound();
  // Ensure agent can only see claims for their own clients
  if (session.user.role === 'agent' && data.user?.agentId !== session.user.id) return notFound();

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

  const isAgent = session.user.role === 'agent';

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <ClaimDetailHeader claim={data} />

      {isAgent && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <p className="font-semibold">Centralized Claim Handling</p>
          <p>
            Claims are managed directly by Interdomestik operations. This view is for tracking
            status only so you can keep your client informed.
          </p>
        </div>
      )}

      {/* 3-Pane Cockpit Layout for Staff/Admin, Simplified for Agents */}
      <div className={isAgent ? 'max-w-xl' : 'grid gap-6 lg:grid-cols-3'}>
        <ClaimInfoPane claim={data} readOnly={isAgent} />

        {!isAgent && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
