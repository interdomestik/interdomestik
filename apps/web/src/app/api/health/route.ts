import { db } from '@interdomestik/database';
import { user } from '@interdomestik/database/schema/auth';
import { NextRequest, NextResponse } from 'next/server';

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
    database: await checkDatabaseHealth(),
    redis: process.env.UPSTASH_REDIS_REST_URL ? await checkRedisHealth() : undefined,
    // Service health checks (simplified for now)
    email: { status: 'healthy', lastCheck: new Date().toISOString() },
    push: { status: 'healthy', lastCheck: new Date().toISOString() },
    ai: { status: 'healthy', lastCheck: new Date().toISOString() },
  };

  // Logic allows for "degraded" if needed, but keeping simple "unhealthy" if any service fails for now,
  // or matches original logic: if any fail, overall is unhealthy.
  // Original logic had a slight inconsistency where Redis fail made it degraded if previous was healthy.
  // We'll standardise: if DB is down -> unhealthy. If Redis is down -> degraded?

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  if (services.database.status === 'unhealthy') {
    overallStatus = 'unhealthy';
  } else if (services.redis?.status === 'unhealthy') {
    overallStatus = 'degraded';
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

async function checkDatabaseHealth(): Promise<ServiceHealth> {
  try {
    const dbStartTime = Date.now();
    await db.select({ id: user.id }).from(user).limit(1);
    const dbResponseTime = Date.now() - dbStartTime;
    return {
      status: 'healthy',
      responseTime: dbResponseTime,
      lastCheck: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown database error',
      lastCheck: new Date().toISOString(),
    };
  }
}

async function checkRedisHealth(): Promise<ServiceHealth> {
  try {
    const redisStartTime = Date.now();
    const response = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/ping`, {
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      },
    });
    const redisResponseTime = Date.now() - redisStartTime;

    if (!response.ok) {
      throw new Error(`Redis returned ${response.status}`);
    }

    return {
      status: 'healthy',
      responseTime: redisResponseTime,
      lastCheck: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown Redis error',
      lastCheck: new Date().toISOString(),
    };
  }
}

export async function GET(_request: NextRequest) {
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

export async function HEAD(_request: NextRequest) {
  const health = await healthCheck();
  const statusCode = health.status === 'healthy' ? 200 : 503;

  return new NextResponse(null, { status: statusCode });
}
