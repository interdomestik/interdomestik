/**
 * Date formatting utilities used across components
 */

export function formatDate(value: Date | string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString();
}
