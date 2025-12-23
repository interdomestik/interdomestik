export type ClaimsScope = 'member' | 'admin' | 'staff_queue' | 'staff_all' | 'agent_queue';

export type ClaimsListItem = {
  id: string;
  title: string;
  status: string | null;
  createdAt: string | null;
  companyName: string | null;
  claimAmount: string | null;
  currency: string | null;
  category: string | null;
  claimantName?: string | null;
  claimantEmail?: string | null;
  unreadCount?: number;
};

export type ClaimsListResponse = {
  success: boolean;
  claims: ClaimsListItem[];
  page: number;
  perPage: number;
  totalCount: number;
  totalPages: number;
  error?: string;
};

type FetchClaimsParams = {
  scope: ClaimsScope;
  status?: string;
  search?: string;
  page?: number;
  perPage?: number;
  signal?: AbortSignal;
};

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
  });

  if (!response.ok) {
    throw new Error('Failed to fetch claims');
  }

  const data = (await response.json()) as ClaimsListResponse;
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch claims');
  }

  return data;
}
