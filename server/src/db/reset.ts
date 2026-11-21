/** Deletes the embedded demo database. The next `npm run dev` re-creates and re-seeds it. */
import fs from 'node:fs';
import { config } from '../config';

if (config.databaseUrl) {
  console.log('DATABASE_URL is set — refusing to delete a real database. Drop the tables manually if you really mean it.');
  process.exit(1);
}
fs.rmSync(config.pgliteDir, { recursive: true, force: true });
console.log(`Deleted ${config.pgliteDir}. Run "npm run dev" to start fresh with demo data.`);
