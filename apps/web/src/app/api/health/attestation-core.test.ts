import { describe, expect, it, vi } from 'vitest';

import { ATTESTATION_SCHEMA_VERSION, handleRuntimeAttestation } from './attestation-core';

const CHALLENGE = 'A'.repeat(42) + '_';
const OBSERVATION = {
  sessionUser: 'interdomestik_runtime_rls',
  currentUser: 'interdomestik_runtime_rls',
};

function request(body: string, headers: Record<string, string> = {}) {
  return { headers: new Headers(headers), text: vi.fn(async () => body) };
}

function deps(overrides: Partial<Parameters<typeof handleRuntimeAttestation>[1]> = {}) {
  return {
    getSession: vi.fn(async () => ({ user: { role: 'super_admin' } })),
    observe: vi.fn(async () => OBSERVATION),
    commitSha: () => 'a'.repeat(40),
    now: () => new Date('2026-11-05T20:00:00.000Z'),
    ...overrides,
  };
}

const body = (value: unknown) => JSON.stringify(value);

describe('handleRuntimeAttestation (U2-e)', () => {
  it('returns the observation bound to the challenge, build commit and time for a super admin', async () => {
    const d = deps();
    const result = await handleRuntimeAttestation(request(body({ challenge: CHALLENGE })), d);
    expect(result).toEqual({
      status: 200,
      body: {
        ...OBSERVATION,
        schemaVersion: ATTESTATION_SCHEMA_VERSION,
        challenge: CHALLENGE,
        commitSha: 'a'.repeat(40),
        observedAt: '2026-11-05T20:00:00.000Z',
      },
    });
    expect(d.observe).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no session', async () => null, 401, 'UNAUTHENTICATED'],
    ['a session without a user', async () => ({ user: null }), 401, 'UNAUTHENTICATED'],
    [
      'a failing session lookup',
      async () => Promise.reject(new Error('db password=x')),
      401,
      'UNAUTHENTICATED',
    ],
    ['a tenant admin', async () => ({ user: { role: 'tenant_admin' } }), 403, 'FORBIDDEN'],
    ['staff', async () => ({ user: { role: 'staff' } }), 403, 'FORBIDDEN'],
    ['a role-less user', async () => ({ user: {} }), 403, 'FORBIDDEN'],
  ])(
    'refuses %s before reading the body or observing',
    async (_name, getSession, status, error) => {
      const d = deps({ getSession });
      const req = request(body({ challenge: CHALLENGE }));
      expect(await handleRuntimeAttestation(req, d)).toEqual({ status, body: { error } });
      expect(req.text).not.toHaveBeenCalled();
      expect(d.observe).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['malformed JSON', '{'],
    ['no challenge', body({})],
    ['a short challenge', body({ challenge: 'abc' })],
    ['a non-url-safe challenge', body({ challenge: '+'.repeat(43) })],
    ['extra fields', body({ challenge: CHALLENGE, role: 'postgres' })],
    ['a non-string challenge', body({ challenge: 7 })],
    ['null', 'null'],
  ])('refuses %s without observing', async (_name, raw) => {
    const d = deps();
    expect(await handleRuntimeAttestation(request(raw), d)).toEqual({
      status: 400,
      body: { error: 'INVALID_CHALLENGE' },
    });
    expect(d.observe).not.toHaveBeenCalled();
  });

  it('refuses oversized bodies by header or by length', async () => {
    const d = deps();
    const declared = request(body({ challenge: CHALLENGE }), { 'content-length': '4096' });
    expect((await handleRuntimeAttestation(declared, d)).status).toBe(413);
    expect(declared.text).not.toHaveBeenCalled();
    const actual = request(body({ challenge: CHALLENGE, pad: 'x'.repeat(400) }));
    expect((await handleRuntimeAttestation(actual, d)).status).toBe(413);
    expect(d.observe).not.toHaveBeenCalled();
  });

  it('maps observation failures to fixed codes without driver text', async () => {
    const secret = 'postgres://interdomestik_runtime_rls:hunter2@db.example/postgres';
    const failed = await handleRuntimeAttestation(
      request(body({ challenge: CHALLENGE })),
      deps({ observe: async () => Promise.reject(new Error(secret)) })
    );
    expect(failed).toEqual({ status: 503, body: { error: 'OBSERVATION_FAILED' } });
    expect(JSON.stringify(failed)).not.toContain('hunter2');

    const slow = await handleRuntimeAttestation(
      request(body({ challenge: CHALLENGE })),
      deps({ observe: () => new Promise(() => {}), timeoutMs: 5 })
    );
    expect(slow).toEqual({ status: 503, body: { error: 'OBSERVATION_TIMEOUT' } });
  });

  it('never lets the observation override the bound challenge, commit or schema', async () => {
    const forged = {
      ...OBSERVATION,
      challenge: 'x',
      commitSha: 'b'.repeat(40),
      schemaVersion: 'v0',
    };
    const result = await handleRuntimeAttestation(
      request(body({ challenge: CHALLENGE })),
      deps({ observe: async () => forged })
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      challenge: CHALLENGE,
      commitSha: 'a'.repeat(40),
      schemaVersion: ATTESTATION_SCHEMA_VERSION,
    });
  });
});
