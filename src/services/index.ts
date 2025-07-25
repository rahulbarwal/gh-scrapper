export { ConfigManager } from "./config";
export { AuthenticationService, type AuthValidationResult } from "./auth";
export { SetupService } from "./setup";
export {
  GitHubClient,
  GitHubApiError,
  type RateLimitInfo,
  type PaginationOptions,
  type IssueFilters,
  type SearchOptions,
  type GitHubSearchResponse,
} from "./github-client";
export {
  ReportGenerator,
  type ReportMetadata,
  type ReportGenerationOptions,
} from "./report-generator";
export {
  ErrorHandler,
  ScraperError,
  ErrorType,
  type ErrorContext,
  type ErrorSuggestion,
} from "./error-handler";
export {
  GitHubIssueScraper,
  type ScrapingProgress,
  type ScrapingResult,
} from "./scraper";

// JAN client implemented in task 2
export { JANClient } from "./jan-client";

// Prompt manager implemented in task 3
export { PromptManager } from "./prompt-manager";
