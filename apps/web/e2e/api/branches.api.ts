import { APIRequestContext, expect } from '@playwright/test';

interface CreateBranchParams {
  name: string;
  code: string;
  isActive?: boolean;
  tenantId: string;
}

export class BranchesApi {
  constructor(private readonly request: APIRequestContext) {}

  private get headers() {
    const secret = process.env.E2E_API_SECRET;
    if (!secret) {
      throw new Error('E2E_API_SECRET is required for E2E API calls (set it in CI/local env).');
    }
    return {
      'x-e2e-secret': secret,
    };
  }

  /**
   * Creates a branch via internal API (Server Action wrapper or direct DB helper if exposed).
   * Since we don't have a public REST API, we use a test-only route or assume one exists.
   * If not, we'll need to create one. For now, I'll assume we can use the `e2e/api` route I will create.
   */
  async createBranch(params: CreateBranchParams) {
    const res = await this.request.post('api/e2e/branches', {
      headers: this.headers,
      data: {
        action: 'create',
        ...params,
      },
    });
    const body = await res.text().catch(() => '');
    expect(
      res.ok(),
      `Create Branch API failed: status=${res.status()} url=${res.url()} body=${body || '<empty>'}`
    ).toBeTruthy();
    return await res.json();
  }

  async updateBranch(code: string, name: string) {
    const res = await this.request.post('api/e2e/branches', {
      headers: this.headers,
      data: {
        action: 'update',
        code,
        name,
      },
    });
    expect(res.ok(), `Update Branch API failed: ${await res.text()}`).toBeTruthy();
  }

  async deleteBranch(code: string) {
    const res = await this.request.post('api/e2e/branches', {
      headers: this.headers,
      data: {
        action: 'delete',
        code,
      },
    });
    if (res.status() === 404) return; // Already deleted
    expect(res.ok(), `Delete Branch API failed: ${await res.text()}`).toBeTruthy();
  }

  async cleanup(codePrefix: string) {
    // This requires a "list" or "delete by pattern" capability.
    // For now, we'll delete the specific code if known.
    // If we need bulk cleanup, the API route should support it.
    await this.request.post('api/e2e/branches', {
      headers: this.headers,
      data: {
        action: 'cleanup',
        pattern: codePrefix,
      },
    });
  }
}
