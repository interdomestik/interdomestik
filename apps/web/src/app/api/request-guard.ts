import { NextResponse } from 'next/server';
import type { z } from 'zod';

import type { ApiErrorCode, ApiResult } from '@/core-contracts';

type SafeJsonOptions = {
  allowEmptyBody?: boolean;
  emptyBody?: unknown;
  invalidJsonData?: unknown;
  invalidJsonResponse?: () => Response;
  invalidRequestResponse?: () => Response;
};

type SafeJsonResult<T> = { ok: true; data: T } | { ok: false; response: Response };

export type ClientMetadata = {
  ipAddress: string | null;
  userAgent: string | null;
};

const USER_AGENT_MAX_LENGTH = 512;

function guardedErrorResponse(error: string, code: 'invalid_json' | 'invalid_request'): Response {
  return NextResponse.json({ success: false, error, code }, { status: 400 });
}

export async function safeJson<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
  options: SafeJsonOptions = {}
): Promise<SafeJsonResult<z.infer<T>>> {
  const invalidJson =
    options.invalidJsonResponse ?? (() => guardedErrorResponse('Invalid JSON', 'invalid_json'));
  const invalidRequest =
    options.invalidRequestResponse ??
    (() => guardedErrorResponse('Invalid request', 'invalid_request'));

  let body: unknown;
  try {
    const text = await request.text();
    if (text.trim().length === 0) {
      if (!options.allowEmptyBody) return { ok: false, response: invalidJson() };
      body = options.emptyBody ?? {};
    } else {
      body = JSON.parse(text);
    }
  } catch {
    if (!('invalidJsonData' in options)) return { ok: false, response: invalidJson() };
    body = options.invalidJsonData;
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, response: invalidRequest() };

  return { ok: true, data: parsed.data };
}

export function getClientMetadata(headers: Headers): ClientMetadata {
  const forwardedIp = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = headers.get('x-real-ip')?.trim();
  const userAgent = headers.get('user-agent')?.trim();

  return {
    ipAddress: forwardedIp || realIp || null,
    userAgent: userAgent ? userAgent.slice(0, USER_AGENT_MAX_LENGTH) : null,
  };
}

export function apiResultStatus(code: ApiErrorCode): number {
  switch (code) {
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
      return 409;
    case 'RATE_LIMIT':
      return 429;
    case 'PAYLOAD_TOO_LARGE':
      return 413;
    case 'UNPROCESSABLE_ENTITY':
      return 422;
    case 'TIMEOUT':
      return 504;
    case 'INTERNAL_ERROR':
      return 500;
    case 'BAD_REQUEST':
    default:
      return 400;
  }
}

export function apiResultResponse<T>(
  result: ApiResult<T>,
  options: { message?: (code: ApiErrorCode) => string } = {}
): Response {
  if (result.ok) return NextResponse.json(result.data);

  return NextResponse.json(
    {
      success: false,
      error: options.message?.(result.code) ?? result.message ?? 'Request failed',
      code: result.code,
    },
    { status: apiResultStatus(result.code) }
  );
}
