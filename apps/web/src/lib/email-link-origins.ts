import { getServerDeploymentOrigin } from './deployment-origin.server';
import type { TenantId } from './tenant/tenant-host-aliases';

export type TenantEmailOrigins = Readonly<{ authOrigin: string; appOrigin: string }>;
export type EmailLinkOriginFailure = 'unknown_tenant' | 'invalid_deployment_origin';

export class EmailLinkOriginError extends Error {
  readonly reason: EmailLinkOriginFailure;

  constructor(reason: EmailLinkOriginFailure) {
    super(`Email link origin unavailable: ${reason}`);
    this.name = 'EmailLinkOriginError';
    this.reason = reason;
  }
}

const TENANT_IDS: readonly TenantId[] = ['tenant_mk', 'tenant_ks', 'tenant_al', 'pilot-mk'];

/** Compatibility shape for email callers; tenant identity never selects the destination. */
export function resolveTenantEmailOrigins(tenantId: TenantId): TenantEmailOrigins {
  if (!TENANT_IDS.includes(tenantId)) throw new EmailLinkOriginError('unknown_tenant');
  let origin: string;
  try {
    origin = getServerDeploymentOrigin();
  } catch {
    throw new EmailLinkOriginError('invalid_deployment_origin');
  }
  return Object.freeze({ authOrigin: origin, appOrigin: origin });
}
