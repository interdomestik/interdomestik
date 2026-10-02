export type ClaimsScope =
  'member' | 'admin' | 'staff_queue' | 'staff_all' | 'staff_unassigned' | 'agent_queue';

export type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'submitted_to_airline'
  | 'verification'
  | 'evaluation'
  | 'negotiation'
  | 'court'
  | 'resolved'
  | 'rejected';

export type ClaimsListItem = {
  id: string;
  title: string;
  status: ClaimStatus | string | null;
  statusLabelKey?: string;
  createdAt: string | null;
  updatedAt: string | null;
  companyName?: string | null;
  claimAmount: string | null;
  currency: string | null;
  category: string | null;
  claimantName?: string | null;
  claimantEmail?: string | null;
  branchName?: string | null;
  branchCode?: string | null;
  unreadCount?: number;
};

export type ClaimsFacets = {
  activeCount: number;
  draftCount: number;
  closedCount: number;
  byStatus: Record<string, number>;
};

export type ClaimsListResponse = {
  success: boolean;
  claims: ClaimsListItem[];
  page: number;
  perPage: number;
  totalCount: number;
  totalPages: number;
  error?: string;
  facets?: ClaimsFacets;
};

type FetchClaimsParams = {
  scope: ClaimsScope;
  status?: string;
  search?: string;
  page?: number;
  perPage?: number;
  signal?: AbortSignal;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseFacets(value: unknown): ClaimsFacets | undefined {
  if (!isRecord(value) || !isRecord(value.byStatus)) return undefined;
  const activeCount = asOptionalNumber(value.activeCount);
  const draftCount = asOptionalNumber(value.draftCount);
  const closedCount = asOptionalNumber(value.closedCount);
  if (activeCount === undefined || draftCount === undefined || closedCount === undefined) {
    return undefined;
  }
  const byStatus: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value.byStatus)) {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) return undefined;
    byStatus[key] = entry;
  }
  return { activeCount, draftCount, closedCount, byStatus };
}

function paginationValue(value: unknown, minimum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error('Failed to fetch claims');
  }
  return value;
}

// The mounted V2 row exposes the stored amount as `amount`; adapt it onto the
// client's existing `claimAmount` field so member and agent views stay compatible.
function parseClaimsListItem(value: unknown): ClaimsListItem {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0) {
    throw new Error('Failed to fetch claims');
  }

  return {
    ...value,
    id: value.id,
    title: typeof value.title === 'string' ? value.title : '',
    status: asNullableString(value.status),
    statusLabelKey: asOptionalString(value.statusLabelKey),
    createdAt: asNullableString(value.createdAt),
    updatedAt: asNullableString(value.updatedAt),
    companyName: asNullableString(value.companyName),
    claimAmount: asNullableString(value.amount),
    currency: asNullableString(value.currency),
    category: asNullableString(value.category),
    claimantName: asNullableString(value.claimantName),
    claimantEmail: asNullableString(value.claimantEmail),
    branchName: asNullableString(value.branchName),
    branchCode: asNullableString(value.branchCode),
    unreadCount: asOptionalNumber(value.unreadCount),
  };
}

function parseClaimsListResponse(value: unknown): ClaimsListResponse {
  if (!isRecord(value)) {
    throw new Error('Failed to fetch claims');
  }

  if (value.success !== true) {
    const message = typeof value.error === 'string' ? value.error : 'Failed to fetch claims';
    throw new Error(message);
  }

  if (!Array.isArray(value.claims)) throw new Error('Failed to fetch claims');
  const claims = value.claims.map(parseClaimsListItem);

  return {
    ...value,
    success: true,
    claims,
    page: paginationValue(value.page, 1),
    perPage: paginationValue(value.perPage, 1),
    totalCount: paginationValue(value.totalCount, 0),
    totalPages: paginationValue(value.totalPages, 0),
    facets: parseFacets(value.facets),
  };
}

export async function fetchClaims({
  scope,
  status,
  search,
  page = 1,
  perPage,
  signal,
}: FetchClaimsParams): Promise<ClaimsListResponse> {
  const params = new URLSearchParams();
  params.set('scope', scope);
  params.set('page', String(page));
  if (perPage) params.set('perPage', String(perPage));
  if (status) params.set('status', status);
  if (search) params.set('search', search);

  const response = await fetch(`/api/claims?${params.toString()}`, {
    signal,
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch claims');
  }

  const raw: unknown = await response.json();
  return parseClaimsListResponse(raw);
}
