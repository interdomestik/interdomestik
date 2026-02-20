import { describe, expect, it, vi } from 'vitest';
import { simpleRegisterApiCore } from './_core';

describe('simpleRegisterApiCore', () => {
  const mockServices = {
    registerUserFn: vi.fn(),
  };

  it('validates input and creates user', async () => {
    mockServices.registerUserFn.mockResolvedValue({ id: 'u1', email: 'test@example.com' });

    const body = {
      email: 'test@example.com',
      name: 'Test User',
      password: 'password123',
      tenantId: 'tenant_ks',
    };

    const result = await simpleRegisterApiCore(body, mockServices);

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.data).toEqual({ id: 'u1', email: 'test@example.com' });
    }
  });

  it('returns badRequest for short password', async () => {
    const body = {
      email: 'test@example.com',
      name: 'Test',
      password: '123',
      tenantId: 'tenant_ks',
    };
    const result = await simpleRegisterApiCore(body, mockServices);

    expect(result.kind).toBe('badRequest');
    if (result.kind === 'badRequest') {
      expect(result.error).toContain('required');
    }
  });

  it('returns conflict if email exists', async () => {
    mockServices.registerUserFn.mockRejectedValue(new Error('Email already exists'));

    const body = {
      email: 'existing@example.com',
      name: 'Test',
      password: 'password123',
      tenantId: 'tenant_ks',
    };
    const result = await simpleRegisterApiCore(body, mockServices);

    expect(result.kind).toBe('conflict');
    if (result.kind === 'conflict') {
      expect(result.error).toBe('Email already exists');
    }
  });
});
