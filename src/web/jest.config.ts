import type { JestConfigWithTsJest } from 'ts-jest';

// @ts-jest/jest version: ^29.0.0
// @testing-library/jest-dom version: ^5.16.0
// ts-jest version: ^29.0.0

const config: JestConfigWithTsJest = {
  // Use ts-jest preset for TypeScript processing
  preset: 'ts-jest',

  // Configure jsdom test environment for browser-like testing
  testEnvironment: 'jsdom',

  // Define test file locations
  roots: ['<rootDir>/src'],

  // Configure module name resolution mapping
  moduleNameMapper: {
    // Path aliases matching tsconfig.json
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@pages/(.*)$': '<rootDir>/src/pages/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@store/(.*)$': '<rootDir>/src/store/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    '^@assets/(.*)$': '<rootDir>/src/assets/$1',

    // Handle static assets
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|svg|kml)$': '<rootDir>/src/__mocks__/fileMock.ts'
  },

  // Setup testing environment
  setupFilesAfterEnv: ['@testing-library/jest-dom'],

  // Configure test file patterns
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)'
  ],

  // Configure TypeScript transformation
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },

  // Supported file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  // Configure coverage collection
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/vite-env.d.ts',
    '!src/index.tsx',
    '!src/**/*.stories.{ts,tsx}',
    '!src/**/__mocks__/**',
    '!src/**/types/**'
  ],

  // Set coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Configure test timeout
  testTimeout: 10000,

  // Configure TypeScript processing
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
      diagnostics: {
        warnOnly: false
      }
    }
  },

  // Configure test reporters
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'coverage/junit'
    }]
  ],

  // Configure parallel test execution
  maxWorkers: '50%'
};

export default config;