import { DocumentList } from '@/components/documents/document-list';
import { ClaimEvidenceUploadDialog } from '@/features/member/claims/components/ClaimEvidenceUploadDialog';
import { auth } from '@/lib/auth';
import { Link } from '@/i18n/routing';
import { claimDocuments, claims, db, desc, eq } from '@interdomestik/database';
import { Badge } from '@interdomestik/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { Button } from '@interdomestik/ui/components/button';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';

type DocumentRow = {
  id: string;
  name: string;
  fileSize: number;
  fileType: string;
  claimId: string;
  claimTitle: string | null;
};

export default async function DocumentsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const tDocs = await getTranslations('documents');

  const userClaims = await db
    .select({
      id: claims.id,
      title: claims.title,
    })
    .from(claims)
    .where(eq(claims.userId, session.user.id))
    .orderBy(desc(claims.createdAt));

  const documents = await db
    .select({
      id: claimDocuments.id,
      name: claimDocuments.name,
      fileSize: claimDocuments.fileSize,
      fileType: claimDocuments.fileType,
      claimId: claimDocuments.claimId,
      claimTitle: claims.title,
    })
    .from(claimDocuments)
    .leftJoin(claims, eq(claimDocuments.claimId, claims.id))
    .where(eq(claims.userId, session.user.id))
    .orderBy(desc(claimDocuments.createdAt));

  const documentsByClaim = documents.reduce<Record<string, DocumentRow[]>>((acc, doc) => {
    if (!acc[doc.claimId]) acc[doc.claimId] = [];
    acc[doc.claimId].push(doc);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{tDocs('title')}</h2>
        <p className="text-muted-foreground">{tDocs('subtitle')}</p>
      </div>

      {userClaims.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <p className="text-muted-foreground">{tDocs('empty')}</p>
            <Button asChild size="sm">
              <Link href="/member/claims/new">{tDocs('createClaim')}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {userClaims.map(claim => {
            const docs = documentsByClaim[claim.id] ?? [];
            return (
              <Card key={claim.id} data-testid={`member-documents-claim-${claim.id}`}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{claim.title || 'Claim'}</CardTitle>
                    <Badge variant="outline">{tDocs('filesCount', { count: docs.length })}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <ClaimEvidenceUploadDialog
                      claimId={claim.id}
                      trigger={
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`member-documents-upload-${claim.id}`}
                        >
                          {tDocs('uploadEvidence')}
                        </Button>
                      }
                    />
                    <Button asChild variant="outline" size="sm">
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
