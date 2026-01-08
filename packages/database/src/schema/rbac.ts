import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { tenants } from './tenants';

export const branches = pgTable(
  'branches',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    code: text('code'),
    isActive: boolean('is_active').default(true).notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    uniqueIndex('branches_tenant_slug_uq').on(table.tenantId, table.slug),
    uniqueIndex('branches_tenant_code_uq').on(table.tenantId, table.code),
    index('idx_branches_tenant').on(table.tenantId),
  ]
);

// DEPRECATED FOR RUNTIME AUTH:
// This table is kept for historical role assignment records.
// Active runtime authorization MUST use `session.user` fields (role, branchId, agentId).
// Do not query this table for permission checks.
export const userRoles = pgTable(
  'user_roles',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    branchId: text('branch_id').references(() => branches.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('user_roles_tenant_user_role_branch_uq').on(
      table.tenantId,
      table.userId,
      table.role,
      table.branchId
    ),
  ]
);
