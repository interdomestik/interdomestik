import { inngest } from '@/lib/inngest/client';
import { inngestFunctions } from '@/lib/inngest/functions';
import { Inngest, headerKeys } from 'inngest';
import { serve } from 'inngest/next';
import type { NextRequest } from 'next/server';

const handler = serve({
  // Pin the public receiver independently of the event producer's environment.
  client: new Inngest({ id: inngest.id, isDev: false }),
  functions: inngestFunctions,
});

function unauthorized() {
  return Response.json(
    { error: 'Unauthorized' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function GET(request: NextRequest) {
  try {
    const response = await handler.GET(request, undefined);
    if (!response.ok) return unauthorized();

    const introspection: unknown = await response.clone().json();
    if (
      introspection &&
      typeof introspection === 'object' &&
      'mode' in introspection &&
      introspection.mode === 'cloud' &&
      'authentication_succeeded' in introspection &&
      introspection.authentication_succeeded === true
    ) {
      return response;
    }
  } catch {
    // An unreadable introspection result cannot establish authentication.
    return unauthorized();
  }
  return unauthorized();
}

export function POST(request: NextRequest) {
  if (!request.headers.get(headerKeys.Signature)) return unauthorized();
  return handler.POST(request, undefined);
}

export function PUT(request: NextRequest) {
  // Inngest 3 treats any other configured value as false and falls back to outbound registration.
  const inBandSetting = process.env.INNGEST_ALLOW_IN_BAND_SYNC?.trim().toLowerCase();
  const inBandAllowed =
    inBandSetting === undefined ||
    inBandSetting === 'undefined' ||
    inBandSetting === 'true' ||
    inBandSetting === '1';
  if (
    !inBandAllowed ||
    request.headers.get(headerKeys.InngestSyncKind) !== 'in_band' ||
    !request.headers.get(headerKeys.Signature)
  ) {
    return unauthorized();
  }
  return handler.PUT(request, undefined);
}
