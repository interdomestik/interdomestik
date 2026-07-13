import { encodeBase64url } from './base64url.mjs';

const encoder = new TextEncoder();

export async function accountWithDraftScope(account, secret) {
  const key = await crypto.subtle.importKey(
    'raw', Buffer.from(secret, 'base64url'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC', key, encoder.encode(`REC02-DRAFT-SCOPE\0${account.id}`)
  );
  return Object.freeze({ ...account, draftScope: `draft_${encodeBase64url(new Uint8Array(signature))}` });
}
