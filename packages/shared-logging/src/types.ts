export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  CRITICAL: 'critical',
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

// Security event interface
export interface SecurityEvent {
  timestamp: string;
  level: LogLevel;
  event: string;
  source: string;
  userId?: string;
  tenantId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

// API event interface
export interface ApiEvent {
  timestamp: string;
  method: string;
  url: string;
  status: number;
  responseTime: number;
  userId?: string;
  tenantId?: string;
  ip?: string;
  userAgent?: string;
  error?: string;
}

// Database event interface
export interface DatabaseEvent {
  timestamp: string;
  query: string;
  duration: number;
  rows?: number;
  error?: string;
  userId?: string;
  tenantId?: string;
}

// Authentication event interface
export interface AuthEvent {
  timestamp: string;
  action: 'login' | 'logout' | 'register' | 'password_reset' | 'token_refresh' | 'failed_login';
  userId?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export const LogCategories = {
  SECURITY: 'security',
  API: 'api',
  DATABASE: 'database',
  AUTH: 'auth',
  PERFORMANCE: 'performance',
  BUSINESS: 'business',
} as const;

export type LogCategory = keyof typeof LogCategories;

// Structured log entry interface
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  event?: SecurityEvent | ApiEvent | DatabaseEvent | AuthEvent;
  metadata?: Record<string, unknown>;
  securityEvent?: SecurityEvent;
  apiEvent?: ApiEvent;
  databaseEvent?: DatabaseEvent;
  authEvent?: AuthEvent;
  alertType?: string;
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  enableStructured: boolean;
  filePath?: string;
  maxFileSize?: number;
  maxFiles?: number;
}

export interface SecurityAlertConfig {
  enabled: boolean;
  threshold: {
    failedLogins: number;
    suspiciousQueries: number;
    errorRate: number;
    responseTime: number;
  };
  notifications: {
    email?: string;
    slack?: string;
    webhook?: string;
  };
}
