/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.spec.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/.claude/',
    // TODO: enable after fixing Telegraf callApi mocking (see plan-test-coverage-70.md)
    'src/bot/commands/.*\\.test\\.ts$',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/index.ts',
  ],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          isolatedModules: true,
          ignoreDeprecations: '6.0',
        },
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 10000,
}

module.exports = config
