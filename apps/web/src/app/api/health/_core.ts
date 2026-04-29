export type HealthResult = {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  data?: unknown;
  error?: string;
  statusCode: number;
};

export interface HealthServices {
  performHealthCheckFn: () => Promise<{
    status: 'healthy' | 'unhealthy' | 'degraded';
    timestamp?: string;
  }>;
}

/**
 * Pure core logic for the Health API.
 * Orchestrates health check and maps results to status codes.
 */
export async function getHealthApiCore(services: HealthServices): Promise<HealthResult> {
  try {
    const health = await services.performHealthCheckFn();
    const statusCode = health.status === 'healthy' ? 200 : 503;

    return {
      status: health.status,
      timestamp: health.timestamp || new Date().toISOString(),
      data: health,
      statusCode,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      statusCode: 503,
    };
  }
}
