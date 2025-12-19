import { db } from '@interdomestik/database/db';
import { claimDocuments, claimMessages, claims, user } from '@interdomestik/database/schema';
import { Badge } from '@interdomestik/ui/components/badge';
import { Button } from '@interdomestik/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { Separator } from '@interdomestik/ui/components/separator';
import { format } from 'date-fns';
import { desc, eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@interdomestik/ui/components/tabs'; // Not available yet?
import { Avatar, AvatarFallback, AvatarImage } from '@interdomestik/ui/components/avatar';
import { Textarea } from '@interdomestik/ui/components/textarea';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  FileText,
  MessageSquare,
  Send,
  XCircle,
} from 'lucide-react';

async function getClaimDetails(id: string) {
  const claim = await db.query.claims.findFirst({
    where: eq(claims.id, id),
    with: {
      user: true, // Auto-fetched via relation setup in schema? Or manual join needed?
      // Assuming relations are defined in schema.ts, otherwise manual join:
    },
  });

  // Manual fetch for safety if relations aren't perfect yet
  if (!claim) return null;

  const claimant = await db
    .select()
    .from(user)
    .where(eq(user.id, claim.userId))
    .limit(1)
    .then(res => res[0]);
  const docs = await db.select().from(claimDocuments).where(eq(claimDocuments.claimId, id));
  const messages = await db
    .select()
    .from(claimMessages)
    .where(eq(claimMessages.claimId, id))
    .orderBy(desc(claimMessages.createdAt));

  return { ...claim, claimant, docs, messages };
}

export default async function AdminClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  const data = await getClaimDetails(id);
  const t = await getTranslations('agent.details');
  const tActions = await getTranslations('agent.actions');

  if (!data) return notFound();

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{data.title}</h1>
            <Badge variant="outline" className="capitalize">
              {data.status}
            </Badge>
            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 capitalize ml-2">
              {data.category}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Created on {format(new Date(data.createdAt!), 'PPP p')} • ID: {data.id}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <XCircle className="mr-2 h-4 w-4 text-red-500" />
            {tActions('reject')}
          </Button>
          <Button size="sm">
            <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
            {tActions('approve')}
          </Button>
        </div>
      </div>

      {/* 3-Pane Cockpit Layout */}
      <div className="grid grid-cols-12 gap-6 h-full overflow-hidden">
        {/* Left Pane: Claimant & Case Info (3 cols) */}
        <div className="col-span-3 flex flex-col gap-4 overflow-y-auto pr-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">{t('claimantInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={data.claimant?.image || ''} />
                  <AvatarFallback>{data.claimant?.name?.[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-semibold">{data.claimant?.name}</div>
                  <div className="text-xs text-muted-foreground">{data.claimant?.email}</div>
                </div>
              </div>
              <Separator />
              <div className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">{t('company')}</span>
                <span className="text-sm">{data.companyName}</span>
              </div>
              <div className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">{t('amount')}</span>
                <span className="text-sm font-bold">
                  {data.claimAmount ? `${data.claimAmount} ${data.currency}` : 'N/A'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="flex-1">
            <CardHeader>
              <CardTitle className="text-sm font-medium">{t('description')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {data.description}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Middle Pane: Unified Timeline & Messages (6 cols) */}
        <div className="col-span-6 flex flex-col gap-4 bg-muted/10 rounded-lg p-4 h-full border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Timeline
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {/* Mock Timeline Items if empty */}
            {data.messages.length === 0 && (
              <div className="flex flex-col gap-2 opacity-50 text-center py-10">
                <Clock className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">No interaction history yet.</p>
              </div>
            )}

            {data.messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.senderId === data.claimant?.id ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 text-sm ${
                    msg.isInternal
                      ? 'bg-yellow-100 border-yellow-200 border text-yellow-900'
                      : msg.senderId === data.claimant?.id
                        ? 'bg-white border'
                        : 'bg-primary text-primary-foreground'
                  }`}
                >
                  {msg.isInternal && (
                    <div className="text-xs font-bold mb-1 uppercase opacity-70">Internal Note</div>
                  )}
                  {msg.content}
                  <div className="text-[10px] opacity-70 mt-1 text-right">
                    {format(new Date(msg.createdAt!), 'p')}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-4 border-t">
            <Textarea
              placeholder="Type an internal note or message..."
              className="min-h-[80px] mb-2"
            />
            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-8">
                  <AlertTriangle className="mr-1 h-3 w-3" /> Internal Note
                </Button>
              </div>
              <Button size="sm">
                <Send className="mr-2 h-3 w-3" /> Send
              </Button>
            </div>
          </div>
        </div>

        {/* Right Pane: Documents & Actions (3 cols) */}
        <div className="col-span-3 flex flex-col gap-4 overflow-y-auto pl-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">{t('evidence')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.docs.length === 0 && (
                <div className="text-sm text-muted-foreground italic">{t('noEvidence')}</div>
              )}
              {data.docs.map(doc => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-2 rounded-md border text-sm group hover:bg-muted"
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="truncate max-w-[120px]">{doc.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
