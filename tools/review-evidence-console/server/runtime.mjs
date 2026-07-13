import { parseAccountRegistry } from './auth/account-registry.mjs';
import { decodeBase64url } from './auth/base64url.mjs';
import { createFixtureService } from './fixture-service.mjs';
import { jsonResponse } from './http/responses.mjs';
import { createPortalHandler } from './portal-handler.mjs';
import { createReceiptKeyring } from './receipts/keyring.mjs';
import { createReceiptService } from './receipts/receipt-service.mjs';
import { createSecurityEvents } from './security/events.mjs';

function receiptKeyConfiguration(env) {
  let value;
  try {
    value = JSON.parse(env.REVIEW_PORTAL_RECEIPT_KEYS_JSON ?? '');
  } catch {
    throw new TypeError('Invalid receipt key configuration.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError();
  return value;
}

export async function createPortalHandlerFromEnv(env = process.env, writeEvent) {
  const registry = parseAccountRegistry(env.REVIEW_PORTAL_ACCOUNTS_JSON ?? '');
  const sessionSecret = env.REVIEW_PORTAL_SESSION_SECRET ?? '';
  decodeBase64url(sessionSecret, { min: 32, max: 64 });
  const keys = receiptKeyConfiguration(env);
  if (!env.REVIEW_PORTAL_RECEIPT_PRIVATE_KEY) throw new TypeError('Missing receipt signing key.');
  const keyring = await createReceiptKeyring({
    activeKeyId: keys.activeKeyId,
    publicKeys: keys.publicKeys,
    privateKeyPkcs8: env.REVIEW_PORTAL_RECEIPT_PRIVATE_KEY,
  });
  return createPortalHandler({
    registry,
    sessionSecret,
    fixtureService: createFixtureService(),
    receiptService: createReceiptService({ keyring }),
    events: createSecurityEvents(writeEvent),
  });
}

export function createEnvironmentPortalHandler(
  environment = () => process.env,
  writeEvent = () => {}
) {
  let handlerPromise;
  return async (request, routePath) => {
    try {
      handlerPromise ??= createPortalHandlerFromEnv(environment(), writeEvent).catch(error => {
        handlerPromise = undefined;
        throw error;
      });
      const handler = await handlerPromise;
      return await handler(request, routePath);
    } catch {
      createSecurityEvents(writeEvent).emit('configuration_failed');
      return jsonResponse(503, { code: 'service_unavailable' });
    }
  };
}
