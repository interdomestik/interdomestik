// Re-export all types
export * from './types';

// Export client creators
export { createClient } from './client';
export { createAdminClient, createServerSupabaseClient } from './server';

// Export Drizzle instance and schema
export { db } from './db';
export * from './schema';

// Re-export Drizzle helpers so consumers use the same module instance
export { eq, and, or, ilike, desc, asc, inArray } from 'drizzle-orm';
