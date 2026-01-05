import { NextRequest, NextResponse } from 'next/server';
import { db } from '@interdomestik/database';
import { user } from '@interdomestik/database/schema/auth';
import { eq } from 'drizzle-orm';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    database: ServiceHealth;
    redis?: ServiceHealth;
    email?: ServiceHealth;
    ai?: ServiceHealth;
    push?: ServiceHealth;
  };
  metrics: {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage?: NodeJS.CpuUsage;
  };
}

export interface ServiceHealth {
  status: 'healthy' | 'unhealthy';
  responseTime?: number;
  error?: string;
  lastCheck: string;
}

const startTime = Date.now();

async function healthCheck(): Promise<HealthCheckResult> {
  const services: HealthCheckResult['services'] = {
    database: {
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
    },
  };
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // Database health check
  try {
    const dbStartTime = Date.now();
    const result = await db.select({ id: user.id }).from(user).limit(1);
    const dbResponseTime = Date.now() - dbStartTime;
    services.database = {
      status: 'healthy',
      responseTime: dbResponseTime,
      lastCheck: new Date().toISOString(),
    };
  } catch (error) {
    services.database = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown database error',
      lastCheck: new Date().toISOString(),
    };
    overallStatus = 'unhealthy';
  }

  // Redis health check (if available)
  if (process.env.UPSTASH_REDIS_REST_URL) {
    try {
      const redisStartTime = Date.now();
      const response = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/ping`, {
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        },
      });
      const redisResponseTime = Date.now() - redisStartTime;

      if (response.ok) {
        services.redis = {
          status: 'healthy',
          responseTime: redisResponseTime,
          lastCheck: new Date().toISOString(),
        };
      } else {
        throw new Error(`Redis returned ${response.status}`);
      }
    } catch (error) {
      services.redis = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown Redis error',
        lastCheck: new Date().toISOString(),
      };
      overallStatus = overallStatus === 'healthy' ? 'degraded' : 'unhealthy';
    }
  }

  // Service health checks (simplified for now)
  services.email = {
    status: 'healthy',
    lastCheck: new Date().toISOString(),
  };

  services.push = {
    status: 'healthy',
    lastCheck: new Date().toISOString(),
  };

  services.ai = {
    status: 'healthy',
    lastCheck: new Date().toISOString(),
  };

  // Determine overall status
  const unhealthyServices = Object.values(services).filter(s => s.status === 'unhealthy');
  if (unhealthyServices.length > 0) {
    overallStatus = 'unhealthy';
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    services,
    metrics: {
      uptime: Date.now() - startTime,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const health = await healthCheck();

    const statusCode = health.status === 'healthy' ? 200 : 503;

    return NextResponse.json(health, {
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}

export async function HEAD(request: NextRequest) {
  const health = await healthCheck();
  const statusCode = health.status === 'healthy' ? 200 : 503;

  return new NextResponse(null, { status: statusCode });
}
