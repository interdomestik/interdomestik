// Re-export all types
export * from './types';

// Export client creators
export { createClient } from './client';
export { createAdminClient, createServerSupabaseClient } from './server';
export { withTenantContext } from './tenant';

// Export Drizzle instance and schema
export { db } from './db';
export * from './schema';

// Re-export Drizzle helpers so consumers use the same module instance
export { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
