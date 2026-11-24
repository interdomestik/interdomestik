import { resolveOnboardingAuthority } from '@/lib/auth/onboarding-authority';
import type { TenantId } from '@/lib/tenant/tenant-hosts';

export type SignUpTenantGuardResult =
  | { decision: 'allow' }
  | {
      decision: 'deny';
      code: 'WRONG_TENANT_CONTEXT';
      message: 'Wrong tenant context';
      reason: 'missing_tenant_context' | 'tenant_mismatch';
      resolvedTenantId: TenantId | null;
    };

function getAuthPathname(url: string): string | null {
  return URL.canParse(url) ? new URL(url).pathname : null;
}

export function isEmailSignUpUrl(url: string): boolean {
  return getAuthPathname(url)?.endsWith('/api/auth/sign-up/email') ?? false;
}

export function refuseEmailSignUp(): Response {
  return Response.json(
    { code: 'WRONG_TENANT_CONTEXT', message: 'Wrong tenant context' },
    { status: 401 }
  );
}

export function evaluateEmailSignUpTenantGuard(args: {
  url: string;
  headers: Headers;
  body: unknown;
  admissionTenant: TenantId;
}): SignUpTenantGuardResult | null {
  if (!isEmailSignUpUrl(args.url)) return null;

  const result = resolveOnboardingAuthority({ headers: args.headers, body: args.body });
  if (result.ok && result.intent.tenant === args.admissionTenant) {
    return { decision: 'allow' };
  }
  const mismatch =
    result.ok || result.reason === 'tenant_mismatch' || result.reason === 'forbidden_mode';
  let resolvedTenantId: TenantId | null;
  if (result.ok) {
    resolvedTenantId = args.admissionTenant;
  } else {
    resolvedTenantId = result.resolvedTenantId;
  }
  return {
    decision: 'deny',
    code: 'WRONG_TENANT_CONTEXT',
    message: 'Wrong tenant context',
    reason: mismatch ? 'tenant_mismatch' : 'missing_tenant_context',
    resolvedTenantId,
  };
}
