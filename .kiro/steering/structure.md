# Project Structure

## Directory Organization

```
src/
├── cli/              # CLI interface and command handling
│   ├── __tests__/    # CLI-specific tests
│   └── index.ts      # Main CLI entry point with Commander.js
├── models/           # TypeScript interfaces and data models
│   └── index.ts      # Core data structures (GitHubIssue, Config, etc.)
├── services/         # Business logic and external integrations
│   ├── __tests__/    # Service layer tests
│   ├── auth.ts       # GitHub authentication service
│   ├── config.ts     # Configuration management
│   ├── error-handler.ts # Centralized error handling
│   ├── github-client.ts # GitHub API client
│   ├── issue-parser.ts  # Issue content parsing
│   ├── relevance-filter.ts # Issue relevance scoring
│   ├── report-generator.ts # Markdown report generation
│   ├── setup.ts      # Interactive setup service
│   └── index.ts      # Service exports
└── test-setup.ts     # Jest test configuration
```

## Architecture Patterns

### Service Layer Pattern

- All business logic encapsulated in service classes
- Services are stateless and dependency-injectable
- Clear separation between CLI, services, and models

### Error Handling Strategy

- Centralized error handling with `ErrorHandler` class
- Custom `ScraperError` class with error types and suggestions
- Context-aware error messages with actionable suggestions
- Retryable vs non-retryable error classification

### Configuration Management

- Environment variables take precedence over config files
- Config stored in `~/.github-issue-scraper/config.json`
- Validation with detailed error messages and suggestions

### CLI Design

- Commander.js for argument parsing
- Interactive mode with readline prompts
- Verbose logging with different levels (info, warn, error, debug)
- Help text with examples and environment variable documentation

## Naming Conventions

- **Files**: kebab-case (e.g., `error-handler.ts`, `github-client.ts`)
- **Classes**: PascalCase (e.g., `ConfigManager`, `GitHubClient`)
- **Interfaces**: PascalCase (e.g., `GitHubIssue`, `ErrorContext`)
- **Methods**: camelCase (e.g., `validateToken`, `parseIssue`)
- **Constants**: UPPER_SNAKE_CASE for enums (e.g., `ErrorType.AUTHENTICATION`)

## Testing Strategy

- Unit tests for each service class
- Integration tests for end-to-end workflows
- Test files located alongside source in `__tests__` directories
- Mock external dependencies (GitHub API, file system)
- Test setup file for shared configuration
