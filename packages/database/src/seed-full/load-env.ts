import * as dotenv from 'dotenv';
import { resolve } from 'node:path';

// Force load .env from project root
dotenv.config({ path: resolve(__dirname, '../../../../.env') });
