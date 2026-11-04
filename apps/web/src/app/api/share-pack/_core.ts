import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { ShareActor } from '@/app/api/documents/share-eligible-documents';

export interface SharePackServices {
  createSharePack: (params: {
    authority: TenantAuthority;
    actor: ShareActor;
    documentIds: string[];
  }) => Promise<{ packId: string; token: string; expiresAt: Date }>;
  getSharePack: (params: { token: string }) => Promise<{
    pack: Record<string, unknown>;
    docs: Record<string, unknown>[];
    tenantId: string;
    authority: TenantAuthority;
  } | null>;
  logAuditEvent: (params: {
    authority: TenantAuthority;
    ids: string[];
    accessedBy?: string;
    shareToken: string;
    ipAddress?: string;
    userAgent?: string;
  }) => Promise<void>;
}

export interface CreateSharePackResult {
  ok: boolean;
  error?: string;
  data?: {
    packId: string;
    token: string;
    expiresAt: number;
    validUntil: string;
  };
}

export interface GetSharePackResult {
  ok: boolean;
  error?: string;
  data?: {
    packId: string;
    documents: Array<{
      id: string;
      fileName: string;
      mimeType: string;
      fileSize: number;
    }>;
    validUntil: Date;
  };
}

/**
 * Orchestrates creating a share pack with audition.
 */
export async function createSharePackCore(params: {
  authority: TenantAuthority;
  actor: ShareActor;
  documentIds: string[];
  ipAddress?: string;
  userAgent?: string;
  services: SharePackServices;
}): Promise<CreateSharePackResult> {
  const { authority, actor, ipAddress, userAgent, services } = params;
  // Each document is authorized and audited once, however often it was requested.
  const documentIds = [...new Set(params.documentIds ?? [])];

  if (documentIds.length === 0) {
    return { ok: false, error: 'IDs required' };
  }

  try {
    const result = await services.createSharePack({
      authority,
      actor,
      documentIds,
    });

    await services.logAuditEvent({
      authority,
      ids: documentIds,
      accessedBy: actor.id,
      shareToken: result.token,
      ipAddress,
      userAgent,
    });

    return {
      ok: true,
      data: {
        packId: result.packId,
        token: result.token,
        expiresAt: result.expiresAt.getTime(),
        validUntil: result.expiresAt.toISOString(),
      },
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Invalid IDs') {
      return { ok: false, error: 'Invalid IDs' };
    }
    throw error;
  }
}

/**
 * Orchestrates fetching a share pack with audition.
 */
export async function getSharePackCore(params: {
  token: string;
  ipAddress?: string;
  userAgent?: string;
  services: SharePackServices;
}): Promise<GetSharePackResult> {
  const { token, ipAddress, userAgent, services } = params;

  if (!token) {
    return { ok: false, error: 'Token required' };
  }

  const result = await services.getSharePack({ token });

  if (!result) {
    return { ok: false, error: 'Pack not found, expired, or revoked' };
  }

  const { pack, docs, authority } = result;

  await services.logAuditEvent({
    authority,
    ids: docs.map((d: Record<string, unknown>) => d.id as string),
    shareToken: token,
    ipAddress,
    userAgent,
  });

  return {
    ok: true,
    data: {
      packId: pack.id as string,
      documents: docs.map((d: Record<string, unknown>) => ({
        id: d.id as string,
        fileName: d.fileName as string,
        mimeType: d.mimeType as string,
        fileSize: d.fileSize as number,
      })),
      validUntil: pack.expiresAt as Date,
    },
  };
}
