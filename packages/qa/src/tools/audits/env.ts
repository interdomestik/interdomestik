import fs from 'fs';
import path from 'path';
import { REPO_ROOT } from '../../utils/paths.js';

export async function auditEnv() {
  const requiredVars = [
    'DATABASE_URL',
    'BETTER_AUTH_SECRET',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ];

  const missing: string[] = [];
  const present: string[] = [];
  const envPath = path.join(REPO_ROOT, '.env');

  if (!fs.existsSync(envPath)) {
    return { content: [{ type: 'text', text: '❌ CRITICAL: No .env file found in root!' }] };
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  requiredVars.forEach(v => {
    if (envContent.includes(`${v}=`) && !envContent.includes(`${v}= `)) {
      present.push(v);
    } else {
      const match = envContent.match(new RegExp(`${v}=(.*)`));
      if (match && match[1] && match[1].trim().length > 0) {
        present.push(v);
      } else {
        missing.push(v);
      }
    }
  });

  return {
    content: [
      {
        type: 'text',
        text: `ENV AUDIT\n\nPRESENT:\n${present.map(p => `✅ ${p}`).join('\n')}\n\nMISSING:\n${missing
          .map(m => `❌ ${m}`)
          .join('\n')}`,
      },
    ],
  };
}
