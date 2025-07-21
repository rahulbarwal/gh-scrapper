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
  RelevanceFilter,
  type RelevanceFilterOptions,
  type RelevanceWeights,
  type KeywordMatch,
} from "./relevance-filter";
export {
  IssueParser,
  type ParsedIssueContent,
  type IssueMetadata,
  type WorkaroundPattern,
  type SummaryOptions,
} from "./issue-parser";
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
