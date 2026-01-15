import { hashSync } from 'bcryptjs';

export function hashPassword(password: string): string {
  return hashSync(password, 10);
}
