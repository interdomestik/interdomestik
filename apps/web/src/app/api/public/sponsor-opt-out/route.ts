import { enforceRateLimit } from '@/lib/rate-limit';
import { optOutByToken } from '@interdomestik/domain-membership-billing/sponsors/opt-out';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// SHA-256 HMAC, base64url, as issued by sponsors/roster-crypto.
const inputSchema = z.object({
  token: z
    .string()
    .max(200)
    .regex(/^[A-Za-z0-9_-]{43}$/u),
});
const responseHeaders = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function result(ok: boolean, status: number): NextResponse {
  return NextResponse.json({ ok }, { status, headers: responseHeaders });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const limited = await enforceRateLimit({
      name: 'api/public/sponsor-opt-out',
      limit: 10,
      windowSeconds: 60,
      headers: request.headers,
      analytics: false,
      contentFreeTelemetry: true,
      productionSensitive: true,
    });
    if (limited) {
      const response = result(false, limited.status);
      const retryAfter = limited.headers.get('Retry-After');
      if (retryAfter) response.headers.set('Retry-After', retryAfter);
      return response;
    }
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return result(false, 400);
    const outcome = await optOutByToken(parsed.data.token, new Date());
    // Never return counts, identities, or distinguish unknown, expired and cleared tokens.
    return result(outcome.ok, outcome.ok ? 200 : 400);
  } catch {
    // Exception details can contain tokens. Do not log them.
    return result(false, 500);
  }
}

function methodNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { ...responseHeaders, Allow: 'POST' } });
}

export const GET = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
