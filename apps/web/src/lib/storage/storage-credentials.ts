export function hasConfiguredSupabaseStorage(env: NodeJS.ProcessEnv = process.env): boolean {
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  const isJwt = (value: string) => value.split('.').length === 3;
  const hasRecognizedAnonKey = isJwt(anonKey) || anonKey.startsWith('sb_publishable_');
  const hasRecognizedServiceKey = isJwt(serviceRoleKey) || serviceRoleKey.startsWith('sb_secret_');

  return Boolean(
    (env.SUPABASE_URL?.trim() || env.NEXT_PUBLIC_SUPABASE_URL?.trim()) &&
    hasRecognizedAnonKey &&
    hasRecognizedServiceKey
  );
}
