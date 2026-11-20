import { createTenantSignedDownloadUrl } from '@/lib/storage/service-role';

type SignableDocument = {
  id: string;
  tenantId: string;
  bucket: string | null;
  filePath: string | null;
  name: string | null;
  fileSize: number | null;
  fileType: string | null;
  createdAt: Date | null;
};

export async function signOpsDocuments(documents: SignableDocument[]) {
  const docs = await Promise.all(
    documents.map(async doc => {
      let url = '';
      try {
        if (!doc.bucket || !doc.filePath) throw new Error('Missing storage target');
        const { data, error } = await createTenantSignedDownloadUrl({
          bucket: doc.bucket,
          context: 'ops claim document signed URL',
          family: 'claims',
          path: doc.filePath,
          tenantId: doc.tenantId,
        });
        if (!error) url = data?.signedUrl ?? '';
      } catch {
        // Legacy paths remain refused by the signer. One bad row must not hide other evidence.
      }
      return {
        id: doc.id,
        name: doc.name ?? '',
        fileSize: doc.fileSize,
        fileType: doc.fileType,
        createdAt: doc.createdAt,
        url,
      };
    })
  );
  if (docs.some(doc => !doc.url)) {
    console.warn('Some claim document downloads are unavailable');
  }
  return docs;
}
