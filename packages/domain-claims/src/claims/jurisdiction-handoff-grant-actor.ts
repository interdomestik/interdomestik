import type { HandoffTx, TrustedGrantActorResolver } from './jurisdiction-handoff-types';

export function isRecoveryGrantActorRole(role: string | null | undefined): boolean {
  return role === 'staff' || role === 'admin' || role === 'tenant_admin' || role === 'super_admin';
}

export function isGrantActorInRecoveryTenant(args: {
  actorTenantId: string;
  recoveryTenantId: string;
  role: string;
}): boolean {
  return args.actorTenantId === args.recoveryTenantId && isRecoveryGrantActorRole(args.role);
}

export async function resolveTrustedRecoveryGrantActor(args: {
  actorId: string;
  recoveryTenantId: string;
  resolver: TrustedGrantActorResolver;
  tx: HandoffTx;
}): Promise<boolean> {
  const actor = await args.resolver({
    actorId: args.actorId,
    recoveryTenantId: args.recoveryTenantId,
    tx: args.tx,
  });
  if (!actor) return false;
  return isGrantActorInRecoveryTenant({
    actorTenantId: actor.tenantId,
    recoveryTenantId: args.recoveryTenantId,
    role: actor.role,
  });
}
