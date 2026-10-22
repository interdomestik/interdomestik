import { vi, type Mock } from 'vitest';

interface SelectQuery {
  from: Mock;
  leftJoin: Mock;
  limit: Mock;
  where: Mock;
}
interface QueueQuery extends SelectQuery {
  orderBy: Mock;
}

export function mockSelectRows(
  db: { select: ReturnType<typeof vi.fn> },
  rows: unknown[]
): SelectQuery {
  const query = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    where: vi.fn().mockReturnThis(),
  };
  db.select.mockReturnValue(query);
  return query;
}

export function mockQueueRows(
  db: { select: ReturnType<typeof vi.fn> },
  rows: unknown[]
): QueueQuery {
  const query = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
  };
  db.select.mockReturnValue(query);
  return query;
}
