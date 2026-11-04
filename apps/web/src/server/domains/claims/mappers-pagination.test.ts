import { describe, expect, it } from 'vitest';
import { mapClaimsToDto } from './mappers';

const FACETS = { active: 18, draft: 2, closed: 1, total: 21 };

// Pagination metadata only: the mapper derives counts from facets and never pages rows itself.
// Row offsets and ordering across pages are not exercised here.
describe('claims list pagination metadata', () => {
  it.each([
    [undefined, 21, 3],
    ['active', 18, 2],
    ['draft', 2, 1],
    ['closed', 1, 1],
  ] as const)('pages the %s population (%i claims, %i pages)', (statusFilter, count, pages) => {
    const dto = mapClaimsToDto([], FACETS, 1, 10, 'member', statusFilter);
    expect(dto.pagination).toEqual({ page: 1, perPage: 10, totalCount: count, totalPages: pages });
    expect(dto.totals).toEqual({ active: 18, draft: 2, closed: 1 });
  });
});
