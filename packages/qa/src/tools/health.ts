import { execAsync } from '../utils/exec.js';
import { REPO_ROOT } from '../utils/paths.js';

export async function checkHealth() {
  try {
    const typeCheck = await execAsync('pnpm type-check', { cwd: REPO_ROOT });
    const lint = await execAsync('pnpm lint', { cwd: REPO_ROOT });

    return {
      content: [
        {
          type: 'text',
          text: `✅ HEALTH CHECK PASSED\n\nTYPE CHECK:\n${typeCheck.stdout}\n\nLINT:\n${lint.stdout}`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ HEALTH CHECK FAILED\n\nError: ${error.message}\n\nOutput: ${error.stdout || ''}\n${
            error.stderr || ''
          }`,
        },
      ],
    };
  }
}
