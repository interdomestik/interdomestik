export function getDefaultAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'https://www.interdomestik.com'
      : 'http://localhost:3000')
  );
}
