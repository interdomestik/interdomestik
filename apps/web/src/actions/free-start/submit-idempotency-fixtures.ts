export type RequestCase = { name: string; headers: Record<string, string>; defaultTenant: string };

function requestCase(
  name: string,
  headers: Record<string, string>,
  defaultTenant = ''
): RequestCase {
  return { name, headers, defaultTenant };
}

// Each request is admitted to the KS tenant. Foreign rows must remain invisible even
// when they hold the globally unique idempotency key.
export const REQUEST_CASES: readonly RequestCase[] = [
  requestCase('KS host', { host: 'ks.127.0.0.1.nip.io' }),
  requestCase('KS forwarded host with port', {
    host: 'ks.127.0.0.1.nip.io:3000',
    'x-forwarded-host': 'KS.127.0.0.1.nip.io:3000',
  }),
  requestCase('neutral host with KS default', { host: 'ida.127.0.0.1.nip.io' }, 'tenant_ks'),
];

export function viaEachRequest<T extends { name: string }>(
  cases: readonly T[]
): Array<T & { request: RequestCase; via: string }> {
  return cases.flatMap(entry =>
    REQUEST_CASES.map(request => ({ ...entry, request, via: request.name }))
  );
}
