import { execAsync } from '../utils/exec.js';
import { REPO_ROOT } from '../utils/paths.js';

export async function checkHealth() {
  try {
    const prVerify = await execAsync('pnpm pr:verify', { cwd: REPO_ROOT });
    const securityGuard = await execAsync('pnpm security:guard', { cwd: REPO_ROOT });
    const e2eGate = await execAsync('pnpm e2e:gate', { cwd: REPO_ROOT });

    return {
      content: [
        {
          type: 'text',
          text:
            `✅ HEALTH CHECK PASSED\n\nPR VERIFY:\n${prVerify.stdout}\n` +
            `\nSECURITY GUARD:\n${securityGuard.stdout}\n` +
            `\nE2E GATE:\n${e2eGate.stdout}`,
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
