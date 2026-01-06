export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  expectedRecoveryTime: number;
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerStats {
  failures: number;
  successes: number;
  timeouts: number;
  lastFailureTime?: Date;
  state: CircuitBreakerState;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures = 0;
  private successes = 0;
  private timeouts = 0;
  private lastFailureTime?: Date;
  private nextAttempt?: Date;

  constructor(
    private readonly config: CircuitBreakerConfig,
    private readonly serviceName: string
  ) {}

  async execute<T>(operation: () => Promise<T>, timeoutMs = 30000): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() < (this.nextAttempt?.getTime() || 0)) {
        throw new Error(`Circuit breaker is OPEN for ${this.serviceName}`);
      }
      this.state = CircuitBreakerState.HALF_OPEN;
    }

    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Operation timed out')), timeoutMs);
        }),
      ]);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.successes++;
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.CLOSED;
      this.failures = 0;
    }
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = new Date();

    if (
      this.state === CircuitBreakerState.HALF_OPEN ||
      this.failures >= this.config.failureThreshold
    ) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttempt = new Date(Date.now() + this.config.recoveryTimeout);
    }
  }

  getStats(): CircuitBreakerStats {
    return {
      failures: this.failures,
      successes: this.successes,
      timeouts: this.timeouts,
      lastFailureTime: this.lastFailureTime,
      state: this.state,
    };
  }

  reset() {
    this.state = CircuitBreakerState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.timeouts = 0;
    this.lastFailureTime = undefined;
    this.nextAttempt = undefined;
  }
}

// Pre-configured circuit breakers for common services
export const circuitBreakers = {
  email: new CircuitBreaker(
    {
      failureThreshold: 5,
      recoveryTimeout: 60000, // 1 minute
      monitoringPeriod: 10000,
      expectedRecoveryTime: 30000,
    },
    'email-service'
  ),

  push: new CircuitBreaker(
    {
      failureThreshold: 3,
      recoveryTimeout: 30000, // 30 seconds
      monitoringPeriod: 5000,
      expectedRecoveryTime: 15000,
    },
    'push-service'
  ),

  ai: new CircuitBreaker(
    {
      failureThreshold: 3,
      recoveryTimeout: 45000, // 45 seconds
      monitoringPeriod: 10000,
      expectedRecoveryTime: 30000,
    },
    'ai-service'
  ),

  externalApi: new CircuitBreaker(
    {
      failureThreshold: 5,
      recoveryTimeout: 30000, // 30 seconds
      monitoringPeriod: 5000,
      expectedRecoveryTime: 10000,
    },
    'external-api'
  ),
};
