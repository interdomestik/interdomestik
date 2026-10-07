export type RequestCase = { name: string; headers: Record<string, string>; defaultTenant: string };

function requestCase(
  name: string,
  headers: Record<string, string>,
  defaultTenant = ''
): RequestCase {
  return { name, headers, defaultTenant };
}

// Technical reservation partition only: every non-MK request (KS, AL, pilot, neutral or missing
// host with a non-MK default) is projected onto the provisioned tenant_ks partition, so these
// requests SHARE one partition. No AL-vs-KS host isolation is claimed and the projection grants
// no tenant, access, legal, country or booking identity.
export const REQUEST_CASES: readonly RequestCase[] = [
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
