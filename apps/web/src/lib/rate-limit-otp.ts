import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

import { NextResponse } from 'next/server';

import { enforceRateLimit } from './rate-limit.core';

export type OtpRateKind = 'send' | 'verify';
export type OtpRateDimension = 'ip' | 'identity';

export function getOtpRateLimitPolicies(kind: OtpRateKind) {
  const windowSeconds = kind === 'send' ? 60 : 10;
  return [
    { dimension: 'ip' as const, limit: 3, windowSeconds },
    { dimension: 'identity' as const, limit: 3, windowSeconds },
  ];
}

export function buildOtpIdentityKey(args: {
  secret: string;
  tenantId: string;
  email: string;
}): string {
  return createHmac('sha256', args.secret)
    .update(`${args.tenantId}\0${args.email.trim().toLowerCase()}`)
    .digest('hex');
}

export function resolveOtpClientIp(headers: Headers, production: boolean): string | null {
  const forwarded = headers
    .get('x-forwarded-for')
    ?.split(',')
    .map(value => value.trim())
    .find(value => isIP(value) !== 0);
  if (forwarded) return forwarded;
  const realIp = headers.get('x-real-ip')?.trim();
  return !production && realIp && isIP(realIp) !== 0 ? realIp : null;
}

function unavailable(windowSeconds: number): NextResponse {
  return NextResponse.json(
    { error: 'Service Unavailable' },
    { status: 503, headers: { 'Retry-After': String(windowSeconds) } }
  );
}

export async function enforceOtpRateLimits(args: {
  kind: OtpRateKind;
  tenantId?: string;
  email?: string;
  secret?: string;
  headers: Headers;
  dimensions?: readonly OtpRateDimension[];
}): Promise<NextResponse | null> {
  const production = process.env.NODE_ENV === 'production';
  const dimensions = args.dimensions ?? ['ip', 'identity'];
  const policies = getOtpRateLimitPolicies(args.kind).filter(policy =>
    dimensions.includes(policy.dimension)
  );
  const windowSeconds = policies[0]?.windowSeconds ?? (args.kind === 'send' ? 60 : 10);
  const ip = resolveOtpClientIp(args.headers, production);
  const betterAuthSecret = process.env.BETTER_AUTH_SECRET;
  const validSecret =
    typeof args.secret === 'string' &&
    Buffer.byteLength(args.secret, 'utf8') >= 32 &&
    (!betterAuthSecret || args.secret !== betterAuthSecret);
  const needsIdentity = dimensions.includes('identity');
  const validIdentity = !needsIdentity || (!!args.tenantId && !!args.email && validSecret);
  if (!ip || !validIdentity) return production ? unavailable(windowSeconds) : null;

  const headers = new Headers(args.headers);
  headers.set('x-forwarded-for', ip);
  const identity = needsIdentity
    ? buildOtpIdentityKey({ secret: args.secret!, tenantId: args.tenantId!, email: args.email! })
    : null;
  for (const policy of policies) {
    const response = await enforceRateLimit({
      name: `api/auth/otp/${args.kind}:${policy.dimension}`,
      limit: policy.limit,
      windowSeconds: policy.windowSeconds,
      headers,
      keySuffix: policy.dimension === 'identity' ? identity : null,
      keyMode: policy.dimension === 'identity' ? 'suffix' : 'ip',
      analytics: false,
      contentFreeTelemetry: true,
      productionSensitive: true,
    });
    if (response) return response;
  }
  return null;
}
