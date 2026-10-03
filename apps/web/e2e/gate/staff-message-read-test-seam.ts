import type { Page, Route } from '@playwright/test';

// Read transport seam for the staff message read specs: it decides which Next server action is a
// conversation read and fails exactly one of them. No header, cookie or token value is read out,
// logged or reported anywhere in this module.

/**
 * Reports whether a Next server action body decodes to the argument list [claimId], which is the
 * read signature. Returns null when the body is not a decodable JSON argument list.
 */
export function matchesClaimRead(body: string | null, claimId: string): boolean | null {
  const trimmed = body?.trim() ?? '';
  if (!trimmed.startsWith('[')) return null;
  let args: unknown;
  try {
    args = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!Array.isArray(args)) return null;
  return args.length === 1 && args[0] === claimId;
}

/**
 * Fails exactly one read of the current claim. The read is identified by the Next server action
 * header plus an argument list that is structurally exactly [claimId]. Sends and read receipts can
 * carry this claim id too - sendMessage(claimId, content, isInternal) passes three arguments and
 * markMessagesAsRead([messageIds]) passes a single array argument - so both are excluded by
 * argument count and value instead of a body substring. No header, cookie or token value is read
 * out or reported.
 */
export async function failOneClaimRead(
  page: Page,
  claimId: string,
  options: { hold?: boolean } = {}
) {
  let intercepted = 0;
  let opaque = 0;
  let release = () => {};
  const held = new Promise<void>(resolve => {
    release = () => resolve();
  });
  if (!options.hold) release();

  const handler = async (route: Route) => {
    const request = route.request();
    const isServerAction = request.method() === 'POST' && Boolean(request.headers()['next-action']);

    if (intercepted > 0 || !isServerAction) {
      await route.fallback();
      return;
    }

    const match = matchesClaimRead(request.postData(), claimId);
    if (match !== true) {
      // An undecodable payload is only counted, never substring-matched against the claim id.
      if (match === null) opaque += 1;
      await route.fallback();
      return;
    }

    intercepted += 1;
    await held;
    await route.fulfill({
      status: 500,
      contentType: 'text/plain',
      body: 'transport-failure-fixture',
    });
  };

  await page.route('**/*', handler);

  return {
    count: () => intercepted,
    opaquePayloads: () => opaque,
    release: () => release(),
    restore: () => page.unroute('**/*', handler),
  };
}

export type ReadSeam = Awaited<ReturnType<typeof failOneClaimRead>>;

// A failed expectation only proves wrong behaviour when the read was actually reachable; when the
// transport never exposed a decodable argument list the real limitation is reported instead.
export async function withReadSeam<T>(failure: ReadSeam, assertion: () => Promise<T>) {
  try {
    return await assertion();
  } catch (cause) {
    if (failure.count() === 0 && failure.opaquePayloads() > 0) {
      throw new Error(
        `Unsupported seam: ${failure.opaquePayloads()} server action request(s) carried a non-JSON payload, so the single-argument read [claimId] could not be targeted without also matching sends or read receipts that carry the same claim id.`
      );
    }
    throw cause;
  }
}
