/**
 * This file is a manual stub for Supabase types.
 *
 * RATIONALE:
 * We use Drizzle ORM (`src/schema.ts`) as the source of truth for the database schema.
 * The `supabase gen types` command requires a running Docker instance/live DB connection which is flaky in some environments.
 * Since we primarily use `drizzle-orm` for data access, we don't strictly need accurate `supabase-js` types for Tables.
 * This stub satisfies the `createClient<Database>` generic requirements for Storage/Auth usage.
 *
 * If you need to use `supabase-js` for DB queries, use Drizzle instead.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      [key: string]: any;
    };
    Views: {
      [key: string]: any;
    };
    Functions: {
      [key: string]: any;
    };
    Enums: {
      [key: string]: any;
    };
    CompositeTypes: {
      [key: string]: any;
    };
  };
}
