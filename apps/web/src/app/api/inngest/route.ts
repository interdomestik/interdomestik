import { inngest } from '@/lib/inngest/client';
import { inngestFunctions } from '@/lib/inngest/functions';
import { Inngest, InngestCommHandler, headerKeys, type ServeHandlerOptions } from 'inngest';
import { frameworkName } from 'inngest/next';

const privateCacheControl = 'private, no-store';

function serve(options: ServeHandlerOptions) {
  const receiver = new InngestCommHandler({
    ...options,
    frameworkName,
    // Omit transformStreamingResponse so INNGEST_STREAMING cannot mask the SDK's HTTP status.
    handler: (request: Request, method: 'GET' | 'POST' | 'PUT') => ({
      method: () => method,
      url: () => new URL(request.url),
      headers: name => request.headers.get(name),
      body: () => request.text(),
      transformResponse: ({ body, status, headers }) => {
        const response = new Response(body, { status, headers });
        if (status === 401) response.headers.set('Cache-Control', privateCacheControl);
        return response;
      },
    }),
  });
  return { handle: receiver.createHandler() };
}

const handler = serve({
  // Pin the public receiver independently of the event producer's environment.
  client: new Inngest({ id: inngest.id, isDev: false }),
  functions: inngestFunctions,
});

function unauthorized() {
  return Response.json(
    { error: 'Unauthorized' },
    { status: 401, headers: { 'Cache-Control': privateCacheControl } }
  );
}

export async function GET(request: Request) {
  try {
    const response = await handler.handle(request, 'GET');
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
      response.headers.set('Cache-Control', privateCacheControl);
      response.headers.append('Vary', headerKeys.Signature);
      return response;
    }
  } catch {
    // An unreadable introspection result cannot establish authentication.
    return unauthorized();
  }
  return unauthorized();
}

export function POST(request: Request) {
  if (!request.headers.get(headerKeys.Signature)) return unauthorized();
  return handler.handle(request, 'POST');
}

export function PUT(request: Request) {
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
  return handler.handle(request, 'PUT');
}
