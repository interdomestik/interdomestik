import type { CashVerificationDetailsDTO } from '../server/types';

export type VerificationDetailsResult =
  { kind: 'ok'; data: CashVerificationDetailsDTO } | { kind: 'not_found' } | { kind: 'error' };

type FetchLike = (input: string) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

/**
 * Loads one verification attempt for the details drawer. An unknown or out-of-scope id (404) is
 * an expected outcome, for example a stale `?selected=` link, and is reported apart from failures.
 */
export async function fetchVerificationDetails(
  attemptId: string,
  fetchFn: FetchLike = input => fetch(input)
): Promise<VerificationDetailsResult> {
  try {
    const response = await fetchFn(`/api/verification/${encodeURIComponent(attemptId)}`);
    if (response.status === 404) return { kind: 'not_found' };
    if (!response.ok) return { kind: 'error' };
    const body = (await response.json()) as CashVerificationDetailsDTO | { error?: unknown };
    if ('error' in body && body.error) return { kind: 'error' };
    return { kind: 'ok', data: body as CashVerificationDetailsDTO };
  } catch {
    return { kind: 'error' };
  }
}
