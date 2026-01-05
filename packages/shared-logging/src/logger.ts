import type {
  SecurityEvent,
  ApiEvent,
  DatabaseEvent,
  AuthEvent,
  LogEntry,
  LoggerConfig,
} from './types';

export class StructuredLogger {
  private config: LoggerConfig;
  private logBuffer: LogEntry[] = [];
  private alerts: Map<string, { count: number; timestamp: string }> = new Map();

  constructor(config: LoggerConfig) {
    this.config = config;
  }

  // Core logging methods
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', message, metadata);
  }

  error(message: string, error?: Error, metadata?: Record<string, unknown>): void {
    const errorMetadata = { ...metadata, errorInfo: error?.message, stack: error?.stack };
    this.log('error', message, errorMetadata);
  }

  critical(message: string, metadata?: Record<string, unknown>): void {
    this.log('critical', message, metadata);
  }

  // Security-specific logging
  logSecurity(event: SecurityEvent): void {
    this.log('error', `Security event: ${event.event}`, { securityEvent: event });
    this.checkSecurityAlerts(event);
  }

  // API request logging
  logApi(event: ApiEvent): void {
    const level = event.status >= 500 ? 'error' : event.status >= 400 ? 'warn' : 'info';
    this.log(level, `API ${event.method} ${event.url} - ${event.status}`, { apiEvent: event });
    this.checkApiAlerts(event);
  }

  // Database query logging
  logDatabase(event: DatabaseEvent): void {
    const level = event.error ? 'error' : event.duration > 1000 ? 'warn' : 'debug';
    this.log(level, `Database query in ${event.duration}ms`, { databaseEvent: event });
    this.checkDatabaseAlerts(event);
  }

  // Authentication logging
  logAuth(event: AuthEvent): void {
    const level = event.success ? 'info' : 'warn';
    this.log(level, `Auth ${event.action}: ${event.success ? 'success' : 'failed'}`, {
      authEvent: event,
    });
    this.checkAuthAlerts(event);
  }

  // Core log method
  private log(level: LogEntry['level'], message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category: 'SECURITY',
      message,
      ...metadata,
    };

    this.addToBuffer(entry);
    this.flushLog();
  }

  // Log to console (development)
  private logToConsole(entry: LogEntry): void {
    if (!this.config.enableConsole) return;

    const colorMap = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m', // Green
      warn: '\x1b[33m', // Yellow
      error: '\x1b[31m', // Red
      critical: '\x1b[35m', // Magenta
    };

    const reset = '\x1b[0m';
    const color = colorMap[entry.level] || '';

    const formattedMessage = `${color}[${entry.level.toUpperCase()}]${reset} ${entry.timestamp} - ${entry.message}`;

    if (entry.securityEvent) {
      console.log(formattedMessage, entry.securityEvent);
    } else if (entry.apiEvent) {
      console.log(formattedMessage, entry.apiEvent);
    } else if (entry.databaseEvent) {
      console.log(formattedMessage, entry.databaseEvent);
    } else if (entry.authEvent) {
      console.log(formattedMessage, entry.authEvent);
    } else if (entry.metadata) {
      console.log(formattedMessage, entry.metadata);
    } else {
      console.log(formattedMessage);
    }
  }

  // Write to file (production)
  private logToFile(entry: LogEntry): void {
    if (!this.config.enableFile || !this.config.filePath) return;

    // In a real implementation, this would write to a log file
    // For now, we'll just log to console in production too
    console.log('FILE LOG:', JSON.stringify(entry, null, 2));
  }

  // Add to buffer
  private addToBuffer(entry: LogEntry): void {
    this.logBuffer.push(entry);

    // Flush buffer if it gets too large
    if (this.logBuffer.length >= 100) {
      this.flushLog();
    }
  }

  // Flush log buffer
  private flushLog(): void {
    const entries = [...this.logBuffer];
    this.logBuffer = [];

    entries.forEach(entry => {
      if (this.config.enableConsole) {
        this.logToConsole(entry);
      }
      if (this.config.enableFile) {
        this.logToFile(entry);
      }
    });
  }

  // Security alert checking
  private checkSecurityAlerts(event: SecurityEvent): void {
    const key = `security:${event.event}:${event.userId || 'anonymous'}`;
    const existing = this.alerts.get(key);
    const count = existing ? existing.count + 1 : 1;
    this.alerts.set(key, { count, timestamp: new Date().toISOString() });

    // Check for repeated failed attempts
    if (event.event.includes('failed') && count >= 5) {
      this.critical(
        `Suspicious activity detected: ${count} failed attempts for ${event.userId || 'anonymous'}`,
        {
          alertType: 'brute_force',
          count,
        }
      );
    }

    // Check for unusual access patterns
    if (event.event.includes('unauthorized') && count >= 3) {
      this.error(`Multiple unauthorized access attempts detected`, undefined, {
        alertType: 'unauthorized_access',
        count,
      });
    }
  }

  // API alert checking
  private checkApiAlerts(event: ApiEvent): void {
    // Check for slow responses
    if (event.responseTime > 5000) {
      this.warn(`Slow API response detected`, {
        apiEvent: event,
        alertType: 'slow_response',
        responseTime: event.responseTime,
      });
    }

    // Check for error responses
    if (event.status >= 500) {
      this.error(`Server error response`, undefined, {
        apiEvent: event,
        alertType: 'server_error',
        status: event.status,
      });
    }

    // Check for rate limiting
    if (event.status === 429) {
      this.warn(`Rate limit exceeded`, {
        apiEvent: event,
        alertType: 'rate_limit',
      });
    }
  }

  // Database alert checking
  private checkDatabaseAlerts(event: DatabaseEvent): void {
    // Check for slow queries
    if (event.duration > 2000) {
      this.warn(`Slow database query detected`, {
        databaseEvent: event,
        alertType: 'slow_query',
        duration: event.duration,
      });
    }

    // Check for connection errors
    if (event.error && event.error.includes('connection')) {
      this.error(`Database connection error`, undefined, {
        databaseEvent: event,
        alertType: 'connection_error',
      });
    }
  }

  // Authentication alert checking
  private checkAuthAlerts(event: AuthEvent): void {
    const key = `auth:${event.action}:${event.email || event.ip || 'anonymous'}`;
    const existing = this.alerts.get(key);
    const count = existing ? existing.count + 1 : 1;
    this.alerts.set(key, { count, timestamp: new Date().toISOString() });

    // Check for repeated failed logins
    if (event.action === 'failed_login' && !event.success && count >= 5) {
      this.error(`Multiple failed login attempts detected`, undefined, {
        authEvent: event,
        alertType: 'brute_force_login',
        count,
      });
    }

    // Check for suspicious activity
    if (event.action === 'login' && event.success && event.ip) {
      const ipKey = `auth:login:${event.ip}`;
      const ipExisting = this.alerts.get(ipKey);
      const ipCount = ipExisting ? ipExisting.count + 1 : 1;
      this.alerts.set(ipKey, { count: ipCount, timestamp: new Date().toISOString() });

      if (ipCount > 10) {
        this.warn(`Multiple logins from same IP detected`, {
          authEvent: event,
          alertType: 'multiple_logins',
          ipCount,
        });
      }
    }
  }

  // Get alert summary
  getAlertSummary(): Record<string, { count: number; lastSeen: string }> {
    const summary: Record<string, { count: number; lastSeen: string }> = {};

    for (const [key, value] of this.alerts.entries()) {
      summary[key] = { count: value.count, lastSeen: value.timestamp };
    }

    return summary;
  }

  // Clear old alerts (to be called periodically)
  clearOldAlerts(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs;

    for (const [key, value] of this.alerts.entries()) {
      const alertTime = new Date(value.timestamp).getTime();
      if (alertTime < cutoff) {
        this.alerts.delete(key);
      }
    }
  }
}

// Default logger configurations
export const loggerConfigs = {
  development: {
    level: 'debug',
    enableConsole: true,
    enableFile: false,
    enableStructured: true,
  } as LoggerConfig,

  test: {
    level: 'error',
    enableConsole: false,
    enableFile: true,
    enableStructured: true,
    filePath: './logs/test.log',
  } as LoggerConfig,

  production: {
    level: 'info',
    enableConsole: false,
    enableFile: true,
    enableStructured: true,
    filePath: './logs/app.log',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
  } as LoggerConfig,
};

// Create logger instance
export function createLogger(config?: Partial<LoggerConfig>): StructuredLogger {
  const env = process.env.NODE_ENV || 'development';
  const defaultConfig =
    loggerConfigs[env as keyof typeof loggerConfigs] || loggerConfigs.development;

  return new StructuredLogger({ ...defaultConfig, ...config });
}
