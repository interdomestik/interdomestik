export type RequestCase = { name: string; headers: Record<string, string>; defaultTenant: string };

function requestCase(
  name: string,
  headers: Record<string, string>,
  defaultTenant = ''
): RequestCase {
  return { name, headers, defaultTenant };
}

// All hosts and defaults share KS bookkeeping, including historical MK entry points.
export const REQUEST_CASES: readonly RequestCase[] = [
  requestCase('MK host', { host: 'mk.interdomestik.com' }),
  requestCase('neutral host with MK default', { host: 'ida.interdomestik.com' }, 'tenant_mk'),
  requestCase('forwarded MK host and hostile hints', {
    host: 'ks.interdomestik.com',
    'x-forwarded-host': 'mk.interdomestik.com',
    cookie: 'tenantId=tenant_mk',
    'x-tenant-id': 'tenant_mk',
  }),
  requestCase('KS host', { host: 'ks.interdomestik.com' }),
  requestCase('AL host', { host: 'al.interdomestik.com' }),
  requestCase('pilot host', { host: 'pilot.interdomestik.com' }),
  requestCase('neutral host with AL default', { host: 'ida.interdomestik.com' }, 'tenant_al'),
  requestCase(
    'empty forwarded host with pilot default',
    { 'x-forwarded-host': '', host: 'mk.interdomestik.com' },
    'pilot-mk'
  ),
];

export function viaEachRequest<T extends { name: string }>(
  cases: readonly T[]
): Array<T & { request: RequestCase; via: string }> {
  return cases.flatMap(entry =>
    REQUEST_CASES.map(request => ({ ...entry, request, via: request.name }))
  );
}
