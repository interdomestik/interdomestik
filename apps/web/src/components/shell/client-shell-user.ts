export type ClientShellUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string;
};

export function toClientShellUser(
  user: Partial<ClientShellUser> & Record<string, unknown>
): ClientShellUser {
  return {
    id: typeof user.id === 'string' ? user.id : undefined,
    name: typeof user.name === 'string' || user.name === null ? user.name : undefined,
    email: typeof user.email === 'string' || user.email === null ? user.email : undefined,
    image: typeof user.image === 'string' || user.image === null ? user.image : undefined,
    role: typeof user.role === 'string' ? user.role : undefined,
  };
}
