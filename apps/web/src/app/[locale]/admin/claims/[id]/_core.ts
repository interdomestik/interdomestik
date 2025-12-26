import { claimDocuments, claims, db, eq } from '@interdomestik/database';

export type AdminClaimDocument = {
  id: string;
  name: string;
  fileSize: number | null;
  fileType: string | null;
  createdAt: Date | null;
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
}): Promise<AdminClaimDetailsResult> {
  const claim = (await db.query.claims.findFirst({
    where: eq(claims.id, args.claimId),
    with: {
      user: true,
    },
  })) as ClaimWithUser | null;

  if (!claim) return { kind: 'not_found' };

  const docs = await db
    .select({
      id: claimDocuments.id,
      name: claimDocuments.name,
      fileSize: claimDocuments.fileSize,
      fileType: claimDocuments.fileType,
      createdAt: claimDocuments.createdAt,
    })
    .from(claimDocuments)
    .where(eq(claimDocuments.claimId, args.claimId));

  return {
    kind: 'ok',
    data: {
      ...claim,
      docs,
    },
  };
}

type ClaimWithUser = NonNullable<Awaited<ReturnType<typeof db.query.claims.findFirst>>> & {
  user: {
    name: string | null;
    email: string | null;
    image: string | null;
  } | null;
};
