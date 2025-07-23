export { GitHubClient, type SearchOptions } from "./github-client";

export {
  JanClient,
  type JanAnalysisRequest,
  type JanAnalysisResult,
  type JanClientConfig,
} from "./jan-client";

export {
  GeminiClient,
  type GeminiAnalysisRequest,
  type GeminiAnalysisResult,
  type GeminiClientConfig,
} from "./gemini-client";

export {
  AIProviderService,
  type AIProvider,
  type AIAnalysisRequest,
  type AIAnalysisResult,
  type AIProviderConfig,
} from "./ai-provider";

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
  GitHubIssueScraper,
  type ScrapingProgress,
  type ScrapingResult,
} from "./scraper";

export {
  ErrorHandler,
  type ErrorContext,
  type ScraperError,
  type ErrorSuggestion,
} from "./error-handler";

export { ConfigManager } from "./config";
