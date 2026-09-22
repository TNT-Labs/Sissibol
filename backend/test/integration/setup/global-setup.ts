/**
 * Prepara il database di test prima della suite di integrazione:
 * applica le migrazioni Prisma su uno schema pulito.
 *
 * Applicare le migrazioni (e non `db push`) è voluto: così la suite verifica
 * anche che la catena di migrazioni sia applicabile da zero, cosa che oggi
 * nessun controllo garantisce.
 */

import { execSync } from 'child_process';
import { join } from 'path';

module.exports = async function globalSetup(): Promise<void> {
  const url = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Serve DATABASE_URL_TEST (o DATABASE_URL) per i test di integrazione.',
    );
  }

  const backendDir = join(__dirname, '../../..');

  console.log('\n[integration] applico le migrazioni sul database di test...');
  execSync('npx prisma migrate deploy', {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
};
