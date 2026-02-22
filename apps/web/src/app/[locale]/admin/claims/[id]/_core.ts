import { and, claimDocuments, claims, createAdminClient, db, eq } from '@interdomestik/database';

export type AdminClaimDocument = {
  id: string;
  name: string;
  fileSize: number | null;
  fileType: string | null;
  createdAt: Date | null;
  url: string;
};

type ClaimWithUser = NonNullable<Awaited<ReturnType<typeof db.query.claims.findFirst>>> & {
  user: {
    name: string | null;
    email: string | null;
    image: string | null;
  } | null;
};

export type AdminClaimDetailsResult =
  | { kind: 'not_found' }
  | {
      kind: 'ok';
      data: ClaimWithUser & {
        docs: AdminClaimDocument[];
      };
    };

export async function getAdminClaimDetailsCore(args: {
  claimId: string;
  tenantId?: string | null;
}): Promise<AdminClaimDetailsResult> {
  const tenantId = args.tenantId ?? null;
  if (!tenantId) return { kind: 'not_found' };

  const claim = (await db.query.claims.findFirst({
    where: and(eq(claims.id, args.claimId), eq(claims.tenantId, tenantId)),
    with: {
      user: true,
    },
  })) as ClaimWithUser | null;

  if (!claim) return { kind: 'not_found' };

  const rawDocs = await db
    .select({
      id: claimDocuments.id,
      name: claimDocuments.name,
      fileSize: claimDocuments.fileSize,
      fileType: claimDocuments.fileType,
      createdAt: claimDocuments.createdAt,
      filePath: claimDocuments.filePath,
      bucket: claimDocuments.bucket,
    })
    .from(claimDocuments)
    .where(and(eq(claimDocuments.claimId, args.claimId), eq(claimDocuments.tenantId, tenantId)));

  const adminClient = createAdminClient();

  const docs = await Promise.all(
    rawDocs.map(async doc => {
      if (!doc.bucket || !doc.filePath) {
        return {
          id: doc.id,
          name: doc.name,
          fileSize: doc.fileSize,
          fileType: doc.fileType,
          createdAt: doc.createdAt,
          url: '',
        };
      }

      const { data } = await adminClient.storage
        .from(doc.bucket)
        .createSignedUrl(doc.filePath, 60 * 5);
      return {
        id: doc.id,
        name: doc.name,
        fileSize: doc.fileSize,
        fileType: doc.fileType,
        createdAt: doc.createdAt,
        url: data?.signedUrl ?? '',
      };
    })
  );

  return {
    kind: 'ok',
    data: {
      ...claim,
      docs,
    },
  };
}
