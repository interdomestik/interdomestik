import { execAsync } from '../utils/exec.js';
import { WEB_APP } from '../utils/paths.js';

export async function runUnitTests() {
  try {
    const { stdout, stderr } = await execAsync('pnpm test:unit', { cwd: WEB_APP });
    return { content: [{ type: 'text', text: `✅ UNIT TESTS PASSED\n\n${stdout}\n${stderr}` }] };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ UNIT TESTS FAILED\n\nError: ${error.message}\n\nOutput: ${error.stdout || ''}\n${
            error.stderr || ''
          }`,
        },
      ],
    };
  }
}

export async function runE2ETests() {
  try {
    const { stdout, stderr } = await execAsync('pnpm test:e2e', { cwd: WEB_APP });
    return { content: [{ type: 'text', text: `✅ E2E TESTS PASSED\n\n${stdout}\n${stderr}` }] };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ E2E TESTS FAILED\n\nError: ${error.message}\n\nOutput: ${error.stdout || ''}\n${
            error.stderr || ''
          }`,
        },
      ],
    };
  }
}
