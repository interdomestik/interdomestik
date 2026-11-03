import { createTenantSignedDownloadUrl } from '@/lib/storage/service-role';
import { and, claimDocuments, claims, eq } from '@interdomestik/database';
import type { db } from '@interdomestik/database/db';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

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
  /** The viewer session's tenant authority; null when the viewer carries no tenant. */
  authority: TenantAuthority | null;
}): Promise<AdminClaimDetailsResult> {
  const { authority } = args;
  if (!authority) return { kind: 'not_found' };
  const { tenantId } = readTenantAuthority(authority);

  const claim = (await withTenantAuthority(authority, tx =>
    tx.query.claims.findFirst({
      where: and(eq(claims.id, args.claimId), eq(claims.tenantId, tenantId)),
      with: {
        user: true,
      },
    })
  )) as ClaimWithUser | null;

  if (!claim) return { kind: 'not_found' };

  const rawDocs = await withTenantAuthority(authority, tx =>
    tx
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
      .where(and(eq(claimDocuments.claimId, args.claimId), eq(claimDocuments.tenantId, tenantId)))
  );

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

      const { data } = await createTenantSignedDownloadUrl({
        bucket: doc.bucket,
        context: 'admin claim document signed URL',
        family: 'claims',
        path: doc.filePath,
        tenantId,
      });
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
