module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/code', '<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'code/**/*.ts',
    '!code/**/*.d.ts',
    '!code/env.ts',
    '!code/env.sample.ts',
    '!code/sample.env.ts',
    '!code/main.ts',
    '!code/utils/index.ts',
    '!code/interfaces/**',
    '!code/lifecycle-hooks/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  testTimeout: 10000,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Note: --forceExit flag is added in package.json scripts to suppress exit warnings
  // Uncomment detectOpenHandles below to debug test leaks if needed
  // detectOpenHandles: true,
};
