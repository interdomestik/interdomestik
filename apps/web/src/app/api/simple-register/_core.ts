export type SimpleRegisterResult =
  | { kind: 'ok'; data: any }
  | { kind: 'badRequest'; error: string }
  | { kind: 'conflict'; error: string };

export interface SimpleRegisterServices {
  registerUserFn: (params: {
    email: string;
    name: string;
    role?: any; // Using any to match the service's complex union type
  }) => Promise<any>;
}

/**
 * Pure core logic for the Simple Registration API.
 * Handles validation and orchestrates user creation.
 */
export async function simpleRegisterApiCore(
  body: any,
  services: SimpleRegisterServices
): Promise<SimpleRegisterResult> {
  const { email, name, role = 'user', password } = body;

  // 1. Basic validation
  if (!email || !name || !password || password.length < 6) {
    return {
      kind: 'badRequest',
      error: 'Invalid input: email, name, and password (min 6 chars) required',
    };
  }

  try {
    // 2. Call Service
    const user = await services.registerUserFn({ email, name, role });

    return {
      kind: 'ok',
      data: user,
    };
  } catch (error: any) {
    if (error.message === 'Email already exists') {
      return {
        kind: 'conflict',
        error: 'Email already exists',
      };
    }

    console.error('[SimpleRegisterCore] Error:', error);
    throw error; // Let wrapper handle 500
  }
}
