export function encodeBase64url(value) {
  return Buffer.from(value).toString('base64url');
}

export function decodeBase64url(value, { min = 0, max = 4096 } = {}) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new TypeError('Invalid base64url value.');
  }
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length < min || bytes.length > max || bytes.toString('base64url') !== value) {
    throw new TypeError('Invalid base64url length or encoding.');
  }
  return bytes;
}
