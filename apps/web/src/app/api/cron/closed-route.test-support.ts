import { expect } from 'vitest';

export async function expectClosedCronRoute(get: (request: Request) => Response, url: string) {
  const request = new Request(url);
  const response = get(request);
  expect(response.status).toBe(410);

  const withBearer = get(
    new Request(request, { headers: { authorization: 'Bearer synthetic-cron' } })
  );
  expect(withBearer.status).toBe(410);
  expect(await response.text()).toBe('');
}
