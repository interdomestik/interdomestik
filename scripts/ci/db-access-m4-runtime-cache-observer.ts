// Fixed qualification-only substitute for the literal next/cache import.
// It records revalidation calls; it grants no database, Next request or deployment authority.
const paths: string[] = [];

export function revalidatePath(path: string): void {
  if (typeof path !== 'string' || path.length > 512 || paths.length >= 64)
    throw new Error('M4 cache observation refused');
  paths.push(path);
}

export function takeM4CacheCalls(): string[] {
  return paths.splice(0);
}
