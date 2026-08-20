import fs from 'node:fs';
import { resolveToolRepoPath } from '../../utils/tool-repo-root.js';

export async function auditSupabase(repoRoot: string) {
  const configPath = resolveToolRepoPath(repoRoot, 'supabase/config.toml').resolvedPath;
  if (fs.existsSync(configPath)) {
    return {
      content: [
        { type: 'text', text: 'SUPABASE AUDIT: SUCCESS\n\n✅ supabase/config.toml exists' },
      ],
    };
  }
  return {
    content: [{ type: 'text', text: 'SUPABASE AUDIT: WARNING\n\n❌ supabase/config.toml missing' }],
  };
}
