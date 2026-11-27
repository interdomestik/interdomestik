/**
 * This file is a manual stub for Supabase types.
 *
 * RATIONALE:
 * We use Drizzle ORM (`src/schema.ts`) as the source of truth for the database schema.
 * The `supabase gen types` command requires a running Docker instance/live DB connection which is flaky in some environments.
 * Since we primarily use `drizzle-orm` for data access, we don't strictly need accurate `supabase-js` types for Tables.
 * This stub supports Storage/Auth and the service-only inbound storage verification RPC.
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
      record_claim_inbound_object_verification: {
        Args: {
          p_decision_id: string;
          p_bucket: string;
          p_path: string;
          p_file_size: number;
          p_sha256: string;
        };
        Returns: boolean;
      };
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
