# Technology Stack

## Core Technologies

- **TypeScript**: Primary language with strict mode enabled
- **Node.js**: Runtime environment (16.x or higher required)
- **Commander.js**: CLI argument parsing and command structure
- **Axios**: HTTP client for GitHub API interactions
- **fs-extra**: Enhanced file system operations

## Build System

- **TypeScript Compiler**: Compiles to CommonJS modules targeting ES2020
- **Output Directory**: `./dist` (compiled JavaScript)
- **Source Directory**: `./src` (TypeScript source)
- **Binary**: Executable CLI script in `./bin/github-issue-scraper`

## Testing Framework

- **Jest**: Test runner with ts-jest preset
- **Test Environment**: Node.js
- **Test Location**: `src/**/__tests__/**/*.test.ts`
- **Coverage**: Configured to collect from all source files

## Common Commands

```bash
# Development
npm run dev          # Run with ts-node for development
npm run build        # Compile TypeScript to JavaScript
npm start            # Run compiled CLI

# Testing
npm test             # Run all tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report

# Code Quality
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues automatically

# Maintenance
npm run clean        # Remove dist directory
```

## Configuration Files

- **tsconfig.json**: TypeScript compiler configuration with strict mode
- **jest.config.js**: Jest testing configuration
- **package.json**: Dependencies and scripts
- **.eslintrc**: Code linting rules (TypeScript ESLint)
