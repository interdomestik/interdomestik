type TelemetryData = Record<string, unknown>;

const ABSOLUTE_URL_PATTERN = /https?:\/\/[^\s"']+/g;

function redactUrlCandidate(candidate: string): string {
  try {
    const url = new URL(candidate);
    const isStorageSigner = url.pathname.includes('/storage/v1/object/sign/');
    if (!isStorageSigner || !url.searchParams.has('token')) return candidate;

    return `${url.origin}${url.pathname}?signed-capability=redacted`;
  } catch {
    return candidate;
  }
}

export function redactSignedStorageUrls(value: string): string {
  return value.replace(ABSOLUTE_URL_PATTERN, redactUrlCandidate);
}

function containsSignedStorageUrl(value: unknown): boolean {
  return typeof value === 'string' && redactSignedStorageUrls(value) !== value;
}

function redactTelemetryValue(
  key: string,
  value: unknown,
  redactStandaloneQuery: boolean
): unknown {
  if (key === 'http.query' && redactStandaloneQuery) return '?signed-capability=redacted';
  if (typeof value === 'string') return redactSignedStorageUrls(value);
  return value;
}

function redactTelemetryData(
  data: TelemetryData | undefined,
  redactStandaloneQuery = false
): TelemetryData | undefined {
  if (!data) return data;

  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      redactTelemetryValue(key, value, redactStandaloneQuery),
    ])
  );
}

export function redactSignedStorageBreadcrumb<T extends { data?: TelemetryData; message?: string }>(
  breadcrumb: T
): T {
  return {
    ...breadcrumb,
    data: redactTelemetryData(breadcrumb.data),
    message:
      typeof breadcrumb.message === 'string'
        ? redactSignedStorageUrls(breadcrumb.message)
        : breadcrumb.message,
  };
}

export function redactSignedStorageSpan<T extends { data: TelemetryData; description?: string }>(
  span: T
): T {
  const hasSignedStorageUrl =
    Object.values(span.data).some(containsSignedStorageUrl) ||
    containsSignedStorageUrl(span.description);

  return {
    ...span,
    data: redactTelemetryData(span.data, hasSignedStorageUrl) ?? {},
    description:
      typeof span.description === 'string'
        ? redactSignedStorageUrls(span.description)
        : span.description,
  };
}
