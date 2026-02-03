import { notFound } from 'next/navigation';

export function requireRoleOrNotFound(role: string, allowedRoles: readonly string[]) {
  if (!allowedRoles.includes(role)) {
    notFound();
  }
}
