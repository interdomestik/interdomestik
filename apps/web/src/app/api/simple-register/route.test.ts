import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

describe('POST /api/simple-register', () => {
  it('returns gone because the endpoint is retired', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/simple-register?tenantId=tenant_ks',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: 'member@example.com',
          name: 'Member Example',
          password: 'password123',
          role: 'admin',
        }),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: 'This endpoint has been retired. Use the canonical registration flow.',
    });
  });
});
