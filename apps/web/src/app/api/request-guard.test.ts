import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { apiResultResponse, getClientMetadata, safeJson } from './request-guard';

const schema = z.object({ name: z.string() }).strict();

function jsonRequest(body: string): Request {
  return new Request('http://localhost.test/api/test', {
    method: 'POST',
    body,
  });
}

async function expectJson(response: Response, status: number, body: Record<string, unknown>) {
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toEqual(body);
}

describe('safeJson', () => {
  it('returns parsed schema data for valid JSON', async () => {
    const result = await safeJson(jsonRequest('{"name":"Ada"}'), schema);

    expect(result).toEqual({ ok: true, data: { name: 'Ada' } });
  });

  it('returns standard invalid_json without exposing parser details', async () => {
    const result = await safeJson(jsonRequest('{'), schema);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected invalid_json response');
    await expectJson(result.response, 400, {
      success: false,
      error: 'Invalid JSON',
      code: 'invalid_json',
    });
  });

  it('returns standard invalid_request without exposing Zod issues', async () => {
    const result = await safeJson(jsonRequest('{"name":7}'), schema);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected invalid_request response');
    await expectJson(result.response, 400, {
      success: false,
      error: 'Invalid request',
      code: 'invalid_request',
    });
  });

  it('allows empty bodies only with explicit opt-in', async () => {
    const result = await safeJson(jsonRequest(''), schema, {
      allowEmptyBody: true,
      emptyBody: { name: 'empty-default' },
    });

    expect(result).toEqual({ ok: true, data: { name: 'empty-default' } });
  });
});

describe('getClientMetadata', () => {
  it('normalizes first forwarded IP hop and bounds user agent', () => {
    const headers = new Headers({
      'x-forwarded-for': ' 203.0.113.10, 198.51.100.7 ',
      'x-real-ip': '198.51.100.20',
      'user-agent': ` ${'a'.repeat(520)} `,
    });

    expect(getClientMetadata(headers)).toEqual({
      ipAddress: '203.0.113.10',
      userAgent: 'a'.repeat(512),
    });
  });
});

describe('apiResultResponse', () => {
  it('maps shared ApiResult codes to standard HTTP statuses', async () => {
    const response = apiResultResponse({ ok: false, code: 'FORBIDDEN', message: 'Nope' });

    await expectJson(response, 403, {
      success: false,
      error: 'Nope',
      code: 'FORBIDDEN',
    });
  });
});
