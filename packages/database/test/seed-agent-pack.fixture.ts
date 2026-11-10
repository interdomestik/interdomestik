type SeedWrite = { table: unknown; row: Record<string, unknown> };

export const writes: SeedWrite[] = [];

const inserted = {
  onConflictDoNothing: () => Promise.resolve(),
  onConflictDoUpdate: () => Promise.resolve(),
};

// Replaces the existing dynamic DB import only; no connection is initialized.
export const db = {
  insert(table: unknown) {
    return {
      values(row: Record<string, unknown>) {
        writes.push({ table, row });
        return inserted;
      },
    };
  },
  update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
};
