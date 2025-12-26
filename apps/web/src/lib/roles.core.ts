export type RoleLike = string | null | undefined;

export function isMember(role: RoleLike): boolean {
  return role === 'user';
}

export function isStaff(role: RoleLike): boolean {
  return role === 'staff';
}

export function isAdmin(role: RoleLike): boolean {
  return role === 'admin';
}

export function isStaffOrAdmin(role: RoleLike): boolean {
  return role === 'staff' || role === 'admin';
}
