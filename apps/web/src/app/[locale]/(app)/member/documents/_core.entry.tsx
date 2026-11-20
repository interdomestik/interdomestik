import { DocumentList } from '@/components/documents/document-list';
import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { ClaimEvidenceUploadDialog } from '@/features/member/claims/components/ClaimEvidenceUploadDialog';
import { Link } from '@/i18n/routing';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { claimDocuments, claims, desc, eq } from '@interdomestik/database';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { Badge } from '@interdomestik/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { Button } from '@interdomestik/ui/components/button';
import { getTranslations } from 'next-intl/server';
import { and } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

type DocumentRow = {
  id: string;
  name: string;
  fileSize: number;
  fileType: string;
  claimId: string;
};

export default async function DocumentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await getSessionSafe('MemberDocumentsPage');
  const sessionNonNull = requireSessionOrRedirect(session, locale);
  const { authority } = requireSessionOrRedirect(await authorizeSessionTenant(), locale);
  const { tenantId } = readTenantAuthority(authority);

  const tDocs = await getTranslations('documents');

  const userClaims = await withTenantAuthority(authority, tx =>
    tx
      .select({
        id: claims.id,
        title: claims.title,
      })
      .from(claims)
      .where(and(eq(claims.userId, sessionNonNull.user.id), eq(claims.tenantId, tenantId)))
      .orderBy(desc(claims.createdAt))
  );

  const documents = await withTenantAuthority(authority, tx =>
    tx
      .select({
        id: claimDocuments.id,
        name: claimDocuments.name,
        fileSize: claimDocuments.fileSize,
        fileType: claimDocuments.fileType,
        claimId: claimDocuments.claimId,
      })
      .from(claimDocuments)
      .leftJoin(claims, eq(claimDocuments.claimId, claims.id))
      .where(
        and(
          eq(claims.userId, sessionNonNull.user.id),
          eq(claims.tenantId, tenantId),
          eq(claimDocuments.tenantId, tenantId)
        )
      )
      .orderBy(desc(claimDocuments.createdAt))
  );

  const documentsByClaim = documents.reduce<Record<string, DocumentRow[]>>((acc, doc) => {
    if (!acc[doc.claimId]) acc[doc.claimId] = [];
    acc[doc.claimId].push(doc);
    return acc;
  }, {});

  return (
    <div
      className="min-w-0 space-y-6 [overflow-wrap:anywhere]"
      data-testid="member-documents-page-ready"
    >
      <div className="px-4 md:px-0">
        <h2 className="text-2xl font-bold tracking-tight">{tDocs('title')}</h2>
        <p className="text-muted-foreground">{tDocs('subtitle')}</p>
      </div>

      {userClaims.length === 0 ? (
        <Card className="mx-4 md:mx-0" data-testid="member-documents-empty-state">
          <CardContent className="py-10 text-center space-y-4">
            <p className="text-muted-foreground">{tDocs('empty')}</p>
            <Button
              asChild
              size="sm"
              className="h-auto min-h-9 max-w-full whitespace-normal"
              data-testid="member-documents-create-claim"
            >
              <Link href="/member/claims/new">{tDocs('createClaim')}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4 px-4 md:px-0">
          {userClaims.map(claim => {
            const docs = documentsByClaim[claim.id] ?? [];
            return (
              <Card key={claim.id} data-testid={`member-documents-claim-${claim.id}`}>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="break-words text-base [overflow-wrap:anywhere]">
                      {claim.title || tDocs('claimFallback')}
                    </CardTitle>
                    <Badge variant="outline">{tDocs('filesCount', { count: docs.length })}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ClaimEvidenceUploadDialog
                      claimId={claim.id}
                      trigger={
                        <Button
                          variant="outline"
                          className="h-auto min-h-11 max-w-full whitespace-normal sm:min-h-9"
                          size="sm"
                          data-testid={`member-documents-upload-${claim.id}`}
                        >
                          {tDocs('uploadEvidence')}
                        </Button>
                      }
                    />
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-auto min-h-11 max-w-full whitespace-normal sm:min-h-9"
                    >
                      <Link href={`/member/claims/${claim.id}`}>{tDocs('viewClaim')}</Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {docs.length > 0 ? (
                    <DocumentList documents={docs} />
                  ) : (
                    <p className="text-sm text-muted-foreground">{tDocs('emptyList')}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
