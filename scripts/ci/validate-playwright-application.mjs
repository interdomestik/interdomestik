import { validateApplicationDatabaseProfile } from './playwright-database-profiles.mjs';

if (process.argv.length !== 2) throw new Error('Expected application database profile validation');
validateApplicationDatabaseProfile(process.env);
