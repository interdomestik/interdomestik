// Trusted fixture input: mutate signature bytes, never the actual verifier.
export function invalidM4Signature(cookie, token) {
  const prefix = '__Secure-better-auth.session_token=';
  if (typeof cookie !== 'string' || !cookie.startsWith(prefix))
    throw Error('M4 signature control: unexpected cookie');
  const value = decodeURIComponent(cookie.slice(prefix.length));
  const dot = value.lastIndexOf('.');
  const signature = value.slice(dot + 1);
  if (dot < 1 || value.slice(0, dot) !== token || !/^[A-Za-z0-9+/]{43}=$/.test(signature))
    throw Error('M4 signature control: unexpected signed value');
  const changed = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
  return prefix + encodeURIComponent(token + '.' + changed);
}
