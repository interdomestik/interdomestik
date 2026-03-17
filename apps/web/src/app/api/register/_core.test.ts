import { describe, expect, it, vi } from 'vitest';
import { registerUserApiCore } from './_core';

describe('registerUserApiCore', () => {
  const mockActor = { id: 'u1', name: 'Actor' };
  const mockServices = {
    registerMemberFn: vi.fn(),
  };

  it('validates input and calls registration service', async () => {
    mockServices.registerMemberFn.mockResolvedValue({ success: true, id: 'member-1' });

    const body = {
      email: 'test@example.com',
      name: 'John Doe',
      role: 'user',
      planId: 'family',
      password: 'password123',
      phone: '123456789',
    };

    const result = await registerUserApiCore(
      { body, actor: mockActor, tenantId: 't1' },
      mockServices
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(mockServices.registerMemberFn).toHaveBeenCalled();

    // Verify FormData construction indirectly by checking if it was called
    const [actorArg, tenantArg, formDataArg] = mockServices.registerMemberFn.mock.calls[0];
    expect(actorArg).toEqual(mockActor);
    expect(tenantArg).toBe('t1');
    expect(formDataArg.get('fullName')).toBe('John Doe');
    expect(formDataArg.get('planId')).toBe('family');
  });

  it('defaults planId to standard when omitted', async () => {
    mockServices.registerMemberFn.mockResolvedValue({ success: true, id: 'member-2' });

    const body = {
      email: 'standard@example.com',
      name: 'Jane Doe',
      role: 'user',
      password: 'password123',
      phone: '123456789',
    };

    const result = await registerUserApiCore(
      { body, actor: mockActor, tenantId: 't1' },
      mockServices
    );

    expect(result.ok).toBe(true);
    const [, , formDataArg] = mockServices.registerMemberFn.mock.calls[0];
    expect(formDataArg.get('planId')).toBe('standard');
  });

  it('returns 400 on validation failure', async () => {
    const body = { email: 'invalid' };
    const result = await registerUserApiCore(
      { body, actor: mockActor, tenantId: 't1' },
      mockServices
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toBe('Validation failed');
  });
});
