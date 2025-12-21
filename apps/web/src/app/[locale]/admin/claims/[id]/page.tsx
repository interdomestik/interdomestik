import { getStaff } from '@/actions/admin-users';
import { ClaimAssignmentForm } from '@/components/admin/claims/claim-assignment-form';
import { ClaimStatusForm } from '@/components/admin/claims/claim-status-form';
import { MessagingPanel } from '@/components/messaging/messaging-panel';
import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import { claimDocuments, claims } from '@interdomestik/database/schema';
import { Avatar, AvatarFallback, AvatarImage } from '@interdomestik/ui/components/avatar';
import { Badge } from '@interdomestik/ui/components/badge';
import { Button } from '@interdomestik/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { Separator } from '@interdomestik/ui/components/separator';
import { format } from 'date-fns';
import { eq } from 'drizzle-orm';
import { Download, FileText } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

async function getClaimDetails(id: string) {
  const claim = await db.query.claims.findFirst({
    where: eq(claims.id, id),
    with: {
      user: true,
    },
  });

  if (!claim) return null;

  const docs = await db.select().from(claimDocuments).where(eq(claimDocuments.claimId, id));
  return { ...claim, docs };
}

export default async function AdminClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  setRequestLocale(locale);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return notFound();

  const data = await getClaimDetails(id);
  const t = await getTranslations('agent.details');
  const tAdmin = await getTranslations('admin.dashboard');
  const tClaimsAdmin = await getTranslations('admin.claims_page');
  const tCategory = await getTranslations('claims.category');
  const staff = await getStaff();

  if (!data) return notFound();

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{data.title}</h1>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              {tCategory(data.category)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Created on {format(new Date(data.createdAt!), 'PPP p')} • ID: {data.id}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              {tAdmin('status_label')}:
            </span>
            <ClaimStatusForm
              claimId={data.id}
              currentStatus={data.status || 'draft'}
              locale={locale}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              {tClaimsAdmin('assignment.label')}:
            </span>
            <ClaimAssignmentForm
              claimId={data.id}
              currentStaffId={data.staffId || null}
              staff={staff}
            />
          </div>
        </div>
      </div>

      {/* 3-Pane Cockpit Layout */}
      <div className="grid grid-cols-12 gap-6 lg:h-[calc(100vh-16rem)]">
        {/* Left Pane: Claimant & Case Info */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 overflow-y-auto pr-0 lg:pr-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">{t('claimantInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={data.user?.image || ''} />
                  <AvatarFallback>{data.user?.name?.[0]}</AvatarFallback>
                </Avatar>
                <div className="overflow-hidden">
                  <div className="font-semibold truncate">{data.user?.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{data.user?.email}</div>
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
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {data.description}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Middle Pane: Messaging */}
        <div className="col-span-12 lg:col-span-6 flex flex-col gap-4 bg-muted/20 rounded-xl p-4 h-full border border-muted-foreground/10">
          <MessagingPanel claimId={data.id} currentUserId={session.user.id} isAgent={true} />
        </div>

        {/* Right Pane: Documents */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 overflow-y-auto pl-0 lg:pl-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-sm font-medium">{t('evidence')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.docs.length === 0 && (
                <div className="text-sm text-muted-foreground italic py-4">{t('noEvidence')}</div>
              )}
              {data.docs.map(doc => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 rounded-xl border bg-card text-sm group hover:bg-muted/50 hover:border-primary/20 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col truncate">
                      <span className="truncate font-medium">{doc.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {(doc.fileSize / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary shrink-0"
                  >
                    <Download className="h-4 w-4" />
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
