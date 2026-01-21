import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  role: z.enum(['user', 'agent']),
  password: z.string().min(6),
  phone: z.string().optional(),
});

export type RegisterRequestDTO = z.infer<typeof registerSchema>;

export interface RegisterResult {
  ok: boolean;
  data?: any;
  error?: string;
  details?: any;
  status: number;
}

export interface RegisterServices {
  registerMemberFn: (
    actor: { id: string; name: string | null },
    tenantId: string,
    formData: FormData
  ) => Promise<any>;
}

/**
 * Pure core logic for the Registration API.
 * Validates input, constructs FormData, and orchestrates the registration service.
 */
export async function registerUserApiCore(
  params: {
    body: unknown;
    actor: { id: string; name: string | null };
    tenantId: string;
  },
  services: RegisterServices
): Promise<RegisterResult> {
  const { body, actor, tenantId } = params;

  // 1. Validation
  const validated = registerSchema.safeParse(body);
  if (!validated.success) {
    return {
      ok: false,
      error: 'Validation failed',
      details: validated.error.flatten().fieldErrors,
      status: 400,
    };
  }

  try {
    // 2. Map to FormData for the service
    const formData = new FormData();
    formData.append('fullName', validated.data.name);
    formData.append('email', validated.data.email);
    formData.append('role', validated.data.role);
    formData.append('password', validated.data.password);
    if (validated.data.phone) {
      formData.append('phone', validated.data.phone);
    }

    // 3. Call Service
    const data = await services.registerMemberFn(actor, tenantId, formData);

    return {
      ok: true,
      data,
      status: 200,
    };
  } catch (error) {
    console.error('[RegisterCore] Error:', error);
    return {
      ok: false,
      error: 'Internal server error',
      status: 500,
    };
  }
}
