import fs from 'node:fs';
import { REPO_ROOT } from '../../utils/paths.js';
import { findRootEnvFile } from './utils.js';

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
  const envPath = findRootEnvFile(REPO_ROOT);

  if (!envPath || !fs.existsSync(envPath)) {
    return {
      content: [
        {
          type: 'text',
          text: '❌ CRITICAL: No supported env file found in root (.env.local, .env.development.local, .env)!',
        },
      ],
    };
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  requiredVars.forEach(v => {
    if (envContent.includes(`${v}=`) && !envContent.includes(`${v}= `)) {
      present.push(v);
    } else {
      const match = envContent.match(new RegExp(`${v}=(.*)`));
      const val = match?.[1]?.trim();
      if (val && val.length > 0) {
        present.push(v);
      } else {
        missing.push(v);
      }
    }
  });

  const missingStr = missing.map(m => `❌ ${m}`).join('\n');
  return {
    content: [
      {
        type: 'text',
        text: `ENV AUDIT\n\nPRESENT:\n${present.map(p => `✅ ${p}`).join('\n')}\n\nMISSING:\n${missingStr}`,
      },
    ],
  };
}
