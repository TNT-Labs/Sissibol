/**
 * Test di integrazione: richiedono un PostgreSQL reale.
 *
 *   DATABASE_URL_TEST=postgresql://user:pass@localhost:5432/sissibol_test \
 *     npm run test:integration
 *
 * La suite azzera le tabelle fra un test e l'altro, quindi punta sempre a un
 * database dedicato, mai a quello di sviluppo.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/test/integration'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testRegex: '.*\\.int-spec\\.ts$',
  globalSetup: '<rootDir>/test/integration/setup/global-setup.ts',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  // Le suite condividono lo stesso database: eseguirle in parallelo
  // significherebbe azzerarsi le tabelle a vicenda.
  maxWorkers: 1,
  testTimeout: 30000,
};
