import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

export function loadEnvFromRoot() {
  const rootDir = path.resolve(__dirname, '../../../../');
  const envFiles = ['.env', '.env.local'];

  envFiles.forEach(file => {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
      config({ path: filePath });
    }
  });

  // Ensure DATABASE_URL is present
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️  DATABASE_URL not found in environment variables. DB connection might fail.');
  }
}
