CREATE TABLE IF NOT EXISTS "branches" (
  "id" text PRIMARY KEY,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "code" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_roles" (
  "id" text PRIMARY KEY,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "role" text NOT NULL,
  "branch_id" text REFERENCES "branches"("id") ON DELETE cascade,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_roles_tenant_user_role_branch_uq"
  ON "user_roles" ("tenant_id", "user_id", "role", "branch_id");

CREATE INDEX IF NOT EXISTS "idx_branches_tenant_id" ON "branches" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_user_roles_tenant_id" ON "user_roles" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_user_roles_user_id" ON "user_roles" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_roles_branch_id" ON "user_roles" ("branch_id");
