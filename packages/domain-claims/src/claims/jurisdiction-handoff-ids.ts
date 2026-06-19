import { createHash } from 'node:crypto';

export function stableHandoffId(prefix: string, parts: readonly string[]): string {
  return `${prefix}_${createHash('sha256').update(parts.join('\u001f')).digest('hex').slice(0, 32)}`;
}

export function defaultHandoffCorrelationId(args: {
  claimId: string;
  grantActorId: string;
  recoveryLegalTenantId: string;
}): string {
  return `claim:${args.claimId}:jurisdiction-handoff:${args.recoveryLegalTenantId}:${args.grantActorId}`;
}
