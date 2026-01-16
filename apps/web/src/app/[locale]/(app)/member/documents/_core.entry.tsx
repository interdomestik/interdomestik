import { DocumentList } from '@/components/documents/document-list';
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

  const grouped = documents.reduce<Record<string, DocumentRow[]>>((acc, doc) => {
    if (!acc[doc.claimId]) acc[doc.claimId] = [];
    acc[doc.claimId].push(doc);
    return acc;
  }, {});

  const groups = Object.entries(grouped);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{tDocs('title')}</h2>
        <p className="text-muted-foreground">{tDocs('subtitle')}</p>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {tDocs('empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(([claimId, docs]) => (
            <Card key={claimId}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-base">{docs[0]?.claimTitle || 'Claim'}</CardTitle>
                  <Badge variant="outline">{tDocs('filesCount', { count: docs.length })}</Badge>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/member/claims/${claimId}`}>{tDocs('viewClaim')}</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <DocumentList documents={docs} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
