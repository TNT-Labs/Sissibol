/**
 * Test che girano senza database: unit test dei servizi, test del mapping di
 * import e golden master del motore di calcolo bollo.
 *
 * I test di integrazione, che richiedono un PostgreSQL reale, hanno una
 * configurazione a parte (`jest.integration.config.js`) e si lanciano con
 * `npm run test:integration`.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testRegex: '.*\\.spec\\.ts$',
  // I test di integrazione usano il suffisso .int-spec.ts e sono esclusi qui.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/test/integration/'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts'],
};
