import fs from 'fs';
import path from 'path';
import { REPO_ROOT } from '../../utils/paths.js';

export async function auditSupabase() {
  const configPath = path.join(REPO_ROOT, 'supabase/config.toml');
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
