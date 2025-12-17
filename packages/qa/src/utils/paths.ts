import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// paths.ts is in packages/qa/src/utils
// REPO_ROOT: utils -> src -> qa -> packages -> root
export const REPO_ROOT = process.env.MCP_REPO_ROOT || path.resolve(__dirname, '../../../');
export const WEB_APP = path.join(REPO_ROOT, 'apps/web');
