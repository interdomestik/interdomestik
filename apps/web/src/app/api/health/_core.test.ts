import { describe, expect, it, vi } from 'vitest';
import { getHealthApiCore } from './_core';

describe('getHealthApiCore', () => {
  const mockServices = {
    performHealthCheckFn: vi.fn(),
  };

  it('returns 200 for healthy status', async () => {
    mockServices.performHealthCheckFn.mockResolvedValue({
      status: 'healthy',
      timestamp: '2024-01-01T00:00:00Z',
    });

    const result = await getHealthApiCore(mockServices);

    expect(result.status).toBe('healthy');
    expect(result.statusCode).toBe(200);
  });

  it('returns 503 for unhealthy status', async () => {
    mockServices.performHealthCheckFn.mockResolvedValue({
      status: 'unhealthy',
      timestamp: '2024-01-01T00:00:00Z',
    });

    const result = await getHealthApiCore(mockServices);

    expect(result.status).toBe('unhealthy');
    expect(result.statusCode).toBe(503);
  });

  it('returns unhealthy on service throw', async () => {
    mockServices.performHealthCheckFn.mockRejectedValue(new Error('DB Down'));

    const result = await getHealthApiCore(mockServices);

    expect(result.status).toBe('unhealthy');
    expect(result.statusCode).toBe(503);
    expect(result.error).toBe('DB Down');
  });
});
