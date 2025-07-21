import { AxiosError } from "axios";

export enum ErrorType {
  AUTHENTICATION = "AUTHENTICATION",
  NETWORK = "NETWORK",
  RATE_LIMIT = "RATE_LIMIT",
  REPOSITORY_ACCESS = "REPOSITORY_ACCESS",
  VALIDATION = "VALIDATION",
  PARSING = "PARSING",
  FILE_SYSTEM = "FILE_SYSTEM",
  EMPTY_RESULTS = "EMPTY_RESULTS",
  LLM_SERVICE = "LLM_SERVICE",
  LLM_RESPONSE = "LLM_RESPONSE",
  LLM_CONTEXT = "LLM_CONTEXT",
  UNKNOWN = "UNKNOWN",
}

export interface ErrorContext {
  operation: string;
  repository?: string;
  productArea?: string;
  issueId?: number;
  filePath?: string;
  additionalInfo?: Record<string, any>;
}

export interface ErrorSuggestion {
  action: string;
  description: string;
  priority: "high" | "medium" | "low";
}

export class ScraperError extends Error {
  public readonly type: ErrorType;
  public readonly context: ErrorContext;
  public readonly suggestions: ErrorSuggestion[];
  public readonly isRetryable: boolean;
  public readonly originalError?: Error;

  constructor(
    type: ErrorType,
    message: string,
    context: ErrorContext,
    suggestions: ErrorSuggestion[] = [],
    isRetryable: boolean = false,
    originalError?: Error
  ) {
    super(message);
    this.name = "ScraperError";
    this.type = type;
    this.context = context;
    this.suggestions = suggestions;
    this.isRetryable = isRetryable;
    this.originalError = originalError;
  }
}

export class ErrorHandler {
  private static readonly MAX_RETRY_ATTEMPTS = 3;
  private static readonly RETRY_DELAYS = [1000, 2000, 4000]; // Progressive delays in ms

  /**
   * Handle authentication errors with specific guidance
   */
  static handleAuthenticationError(
    error: any,
    context: ErrorContext
  ): ScraperError {
    let message: string;
    let suggestions: ErrorSuggestion[] = [];

    if (error.response?.status === 401) {
      message =
        "GitHub authentication failed. Your token is invalid or expired.";
      suggestions = [
        {
          action: "Check your GitHub token",
          description:
            "Verify that your GITHUB_TOKEN environment variable is set correctly",
          priority: "high",
        },
        {
          action: "Generate a new token",
          description:
            "Create a new Personal Access Token at https://github.com/settings/tokens",
          priority: "high",
        },
        {
          action: "Run setup command",
          description:
            "Use 'github-issue-scraper --setup' to configure authentication",
          priority: "medium",
        },
      ];
    } else if (error.response?.status === 403) {
      const rateLimited = this.isRateLimited(error.response);
      if (rateLimited) {
        return this.handleRateLimitError(error, context);
      }

      message =
        "GitHub access forbidden. Your token may lack required permissions.";
      suggestions = [
        {
          action: "Check token permissions",
          description:
            "Ensure your token has 'repo' scope for private repositories or 'public_repo' for public ones",
          priority: "high",
        },
        {
          action: "Verify repository access",
          description: `Check if you have access to repository: ${context.repository}`,
          priority: "high",
        },
        {
          action: "Use organization token",
          description:
            "If accessing organization repositories, ensure your token has appropriate organization permissions",
          priority: "medium",
        },
      ];
    } else {
      message = `Authentication error: ${
        error.message || "Unknown authentication issue"
      }`;
      suggestions = [
        {
          action: "Check network connection",
          description: "Verify you can reach GitHub.com",
          priority: "medium",
        },
        {
          action: "Try again later",
          description: "GitHub services may be temporarily unavailable",
          priority: "low",
        },
      ];
    }

    return new ScraperError(
      ErrorType.AUTHENTICATION,
      message,
      context,
      suggestions,
      false,
      error
    );
  }

  /**
   * Handle network errors with retry mechanisms
   */
  static handleNetworkError(error: any, context: ErrorContext): ScraperError {
    let message: string;
    let suggestions: ErrorSuggestion[] = [];
    let isRetryable = true;

    if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      message = "Network connection failed. Unable to reach GitHub API.";
      suggestions = [
        {
          action: "Check internet connection",
          description: "Verify your internet connection is working",
          priority: "high",
        },
        {
          action: "Check DNS settings",
          description: "Ensure you can resolve api.github.com",
          priority: "medium",
        },
        {
          action: "Check firewall/proxy",
          description:
            "Verify firewall or corporate proxy isn't blocking GitHub API access",
          priority: "medium",
        },
      ];
    } else if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      message =
        "Request timed out. The GitHub API is taking too long to respond.";
      suggestions = [
        {
          action: "Retry the operation",
          description: "Network timeouts are often temporary",
          priority: "high",
        },
        {
          action: "Check network speed",
          description:
            "Slow connections may cause timeouts with large repositories",
          priority: "medium",
        },
        {
          action: "Reduce batch size",
          description: "Try processing fewer issues at once",
          priority: "low",
        },
      ];
    } else if (error.response?.status >= 500) {
      message = `GitHub server error (${error.response.status}). GitHub services may be experiencing issues.`;
      suggestions = [
        {
          action: "Check GitHub status",
          description:
            "Visit https://www.githubstatus.com/ to check for service issues",
          priority: "high",
        },
        {
          action: "Retry in a few minutes",
          description: "Server errors are usually temporary",
          priority: "high",
        },
      ];
    } else {
      message = `Network error: ${error.message || "Unknown network issue"}`;
      suggestions = [
        {
          action: "Check connection",
          description: "Verify your network connection and try again",
          priority: "high",
        },
      ];
    }

    return new ScraperError(
      ErrorType.NETWORK,
      message,
      context,
      suggestions,
      isRetryable,
      error
    );
  }

  /**
   * Handle rate limiting errors
   */
  static handleRateLimitError(error: any, context: ErrorContext): ScraperError {
    const resetTime = error.response?.headers?.["x-ratelimit-reset"];
    const remaining = error.response?.headers?.["x-ratelimit-remaining"];

    let waitTime = 0;
    if (resetTime) {
      const resetDate = new Date(parseInt(resetTime, 10) * 1000);
      waitTime = Math.max(0, resetDate.getTime() - Date.now());
    }

    const waitMinutes = Math.ceil(waitTime / (1000 * 60));

    const message =
      remaining === "0"
        ? `GitHub API rate limit exceeded. Rate limit resets in ${waitMinutes} minutes.`
        : "GitHub API rate limit exceeded.";

    const suggestions: ErrorSuggestion[] = [
      {
        action: "Wait for rate limit reset",
        description:
          waitTime > 0
            ? `Wait ${waitMinutes} minutes for the rate limit to reset`
            : "Wait for the rate limit to reset and try again",
        priority: "high",
      },
      {
        action: "Use authenticated requests",
        description:
          "Authenticated requests have higher rate limits (5000/hour vs 60/hour)",
        priority: "high",
      },
      {
        action: "Reduce request frequency",
        description:
          "Process fewer issues at once or add delays between requests",
        priority: "medium",
      },
    ];

    return new ScraperError(
      ErrorType.RATE_LIMIT,
      message,
      context,
      suggestions,
      true,
      error
    );
  }

  /**
   * Handle repository access errors
   */
  static handleRepositoryError(
    error: any,
    context: ErrorContext
  ): ScraperError {
    let message: string;
    let suggestions: ErrorSuggestion[] = [];

    if (error.response?.status === 404) {
      message = `Repository not found: ${context.repository}`;
      suggestions = [
        {
          action: "Check repository name",
          description:
            "Verify the repository name is correct (format: owner/repo)",
          priority: "high",
        },
        {
          action: "Check repository visibility",
          description:
            "Ensure the repository is public or you have access to private repositories",
          priority: "high",
        },
        {
          action: "Verify repository exists",
          description: `Visit https://github.com/${context.repository} to confirm the repository exists`,
          priority: "medium",
        },
      ];
    } else if (error.response?.status === 403) {
      message = `Access denied to repository: ${context.repository}`;
      suggestions = [
        {
          action: "Check repository permissions",
          description: "Ensure you have read access to this repository",
          priority: "high",
        },
        {
          action: "Check token scopes",
          description:
            "Private repositories require 'repo' scope, public repositories need 'public_repo'",
          priority: "high",
        },
      ];
    } else {
      message = `Repository access error: ${
        error.message || "Unknown repository issue"
      }`;
      suggestions = [
        {
          action: "Verify repository format",
          description: "Repository should be in format 'owner/repository-name'",
          priority: "medium",
        },
      ];
    }

    return new ScraperError(
      ErrorType.REPOSITORY_ACCESS,
      message,
      context,
      suggestions,
      false,
      error
    );
  }

  /**
   * Handle validation errors
   */
  static handleValidationError(
    message: string,
    context: ErrorContext,
    suggestions: ErrorSuggestion[] = []
  ): ScraperError {
    return new ScraperError(
      ErrorType.VALIDATION,
      message,
      context,
      suggestions,
      false
    );
  }

  /**
   * Handle parsing errors for malformed issues
   */
  static handleParsingError(
    error: any,
    context: ErrorContext,
    issueData?: any
  ): ScraperError {
    const message = `Failed to parse issue data: ${
      error.message || "Malformed issue content"
    }`;

    const suggestions: ErrorSuggestion[] = [
      {
        action: "Skip malformed issues",
        description: "The scraper will continue processing other issues",
        priority: "low",
      },
      {
        action: "Report the issue",
        description:
          "Consider reporting this parsing error if it occurs frequently",
        priority: "low",
      },
    ];

    if (context.issueId) {
      suggestions.unshift({
        action: "Check issue manually",
        description: `Review issue #${context.issueId} manually at GitHub`,
        priority: "medium",
      });
    }

    return new ScraperError(
      ErrorType.PARSING,
      message,
      context,
      suggestions,
      false,
      error
    );
  }

  /**
   * Handle empty results with suggestions for broader searches
   */
  static handleEmptyResults(context: ErrorContext): ScraperError {
    const message = `No relevant issues found for product area: "${context.productArea}"`;

    const suggestions: ErrorSuggestion[] = [
      {
        action: "Broaden search terms",
        description: "Try using more general keywords or synonyms",
        priority: "high",
      },
      {
        action: "Lower relevance threshold",
        description:
          "Reduce the minimum relevance score to include more issues",
        priority: "high",
      },
      {
        action: "Check different issue states",
        description:
          "Include closed issues in your search (they may contain solutions)",
        priority: "medium",
      },
      {
        action: "Expand time range",
        description: "Look at older issues that might still be relevant",
        priority: "medium",
      },
      {
        action: "Try alternative keywords",
        description:
          "Use different terms that might describe the same functionality",
        priority: "medium",
      },
      {
        action: "Check repository activity",
        description: `Verify that ${context.repository} has recent issue activity`,
        priority: "low",
      },
    ];

    return new ScraperError(
      ErrorType.EMPTY_RESULTS,
      message,
      context,
      suggestions,
      false
    );
  }

  /**
   * Handle file system errors
   */
  static handleFileSystemError(
    error: any,
    context: ErrorContext
  ): ScraperError {
    let message: string;
    let suggestions: ErrorSuggestion[] = [];

    if (error.code === "ENOENT") {
      message = `File or directory not found: ${context.filePath}`;
      suggestions = [
        {
          action: "Check file path",
          description: "Verify the file path is correct and accessible",
          priority: "high",
        },
        {
          action: "Create directory",
          description: "Ensure the output directory exists",
          priority: "high",
        },
      ];
    } else if (error.code === "EACCES" || error.code === "EPERM") {
      message = `Permission denied: ${context.filePath}`;
      suggestions = [
        {
          action: "Check file permissions",
          description:
            "Ensure you have write permissions to the output directory",
          priority: "high",
        },
        {
          action: "Choose different location",
          description: "Try saving the report to a different directory",
          priority: "medium",
        },
      ];
    } else if (error.code === "ENOSPC") {
      message = "Insufficient disk space to save the report";
      suggestions = [
        {
          action: "Free up disk space",
          description: "Delete unnecessary files to make room for the report",
          priority: "high",
        },
        {
          action: "Choose different location",
          description: "Save the report to a drive with more available space",
          priority: "medium",
        },
      ];
    } else {
      message = `File system error: ${
        error.message || "Unknown file system issue"
      }`;
      suggestions = [
        {
          action: "Check file system",
          description: "Verify the file system is accessible and not corrupted",
          priority: "medium",
        },
      ];
    }

    return new ScraperError(
      ErrorType.FILE_SYSTEM,
      message,
      context,
      suggestions,
      false,
      error
    );
  }

  /**
   * Create a generic error from unknown errors
   */
  static handleUnknownError(error: any, context: ErrorContext): ScraperError {
    const message = `Unexpected error during ${context.operation}: ${
      error.message || "Unknown error occurred"
    }`;

    const suggestions: ErrorSuggestion[] = [
      {
        action: "Try again",
        description: "The error might be temporary",
        priority: "medium",
      },
      {
        action: "Check logs",
        description:
          "Run with --verbose flag for more detailed error information",
        priority: "medium",
      },
      {
        action: "Report the issue",
        description: "If the error persists, consider reporting it as a bug",
        priority: "low",
      },
    ];

    return new ScraperError(
      ErrorType.UNKNOWN,
      message,
      context,
      suggestions,
      false,
      error
    );
  }

  /**
   * Execute operation with retry logic for retryable errors
   */
  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    maxRetries: number = ErrorHandler.MAX_RETRY_ATTEMPTS
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Convert to ScraperError if needed
        const scraperError = this.convertToScraperError(error, context);

        // Don't retry if error is not retryable
        if (!scraperError.isRetryable || attempt === maxRetries) {
          throw scraperError;
        }

        // Wait before retrying
        const delay =
          this.RETRY_DELAYS[Math.min(attempt, this.RETRY_DELAYS.length - 1)];
        console.log(
          `Operation failed, retrying in ${delay}ms... (attempt ${
            attempt + 1
          }/${maxRetries})`
        );
        await this.sleep(delay);
      }
    }

    throw this.convertToScraperError(lastError, context);
  }

  /**
   * Convert any error to ScraperError
   */
  static convertToScraperError(
    error: any,
    context: ErrorContext
  ): ScraperError {
    // Handle null/undefined errors
    if (error === null || error === undefined) {
      return this.handleUnknownError(
        new Error("Null or undefined error encountered"),
        context
      );
    }

    if (error instanceof ScraperError) {
      return error;
    }

    // Check if it's an Axios error (HTTP request error)
    if (this.isAxiosError(error)) {
      // Check if this is an LLM service error based on context
      if (
        context.operation?.includes("LLM") ||
        context.operation?.includes("JAN") ||
        context.operation?.includes("analyzing issues") ||
        context.additionalInfo?.endpoint?.includes("jan")
      ) {
        // Handle LLM-specific HTTP errors
        if (error.response?.status === 429) {
          return this.handleLLMServiceError(error, context);
        } else if (
          error.response?.status === 404 &&
          context.additionalInfo?.endpoint
        ) {
          return this.handleLLMServiceError(error, context);
        } else if (error.response?.status === 400) {
          // Bad request could be context length or invalid input
          if (
            error.message?.includes("context") ||
            error.message?.includes("token")
          ) {
            return this.handleLLMContextError(error, context);
          }
          return this.handleLLMServiceError(error, context);
        }
      }

      // Handle standard HTTP errors
      if (error.response?.status === 401) {
        return this.handleAuthenticationError(error, context);
      } else if (error.response?.status === 403) {
        if (this.isRateLimited(error.response)) {
          return this.handleRateLimitError(error, context);
        } else {
          return this.handleRepositoryError(error, context);
        }
      } else if (error.response?.status === 404) {
        return this.handleRepositoryError(error, context);
      } else if (!error.response) {
        // Check if this is likely an LLM connection error
        if (
          context.operation?.includes("LLM") ||
          context.operation?.includes("JAN") ||
          context.additionalInfo?.endpoint?.includes("jan")
        ) {
          return this.handleLLMServiceError(error, context);
        }
        return this.handleNetworkError(error, context);
      }
    }

    // Check for LLM context length errors
    if (
      error.message &&
      (error.message.includes("context length") ||
        error.message.includes("maximum context") ||
        error.message.includes("token limit"))
    ) {
      return this.handleLLMContextError(error, context);
    }

    // Check for LLM response parsing errors
    if (
      context.operation?.includes("parsing") &&
      context.operation?.includes("LLM") &&
      error instanceof SyntaxError
    ) {
      return this.handleLLMResponseError(error, context);
    }

    // Check for file system errors
    if (
      error &&
      typeof error === "object" &&
      error.code &&
      ["ENOENT", "EACCES", "EPERM", "ENOSPC"].includes(error.code)
    ) {
      return this.handleFileSystemError(error, context);
    }

    return this.handleUnknownError(error, context);
  }

  /**
   * Format error for user display
   */
  static formatError(
    error: ScraperError,
    includeContext: boolean = true
  ): string {
    let formatted = `❌ ${error.message}\n`;

    if (includeContext && error.context.operation) {
      formatted += `\n📍 Context: ${error.context.operation}`;
      if (error.context.repository) {
        formatted += ` (${error.context.repository})`;
      }
      formatted += "\n";
    }

    if (error.suggestions.length > 0) {
      formatted += "\n💡 Suggestions:\n";
      error.suggestions
        .sort((a, b) => {
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        })
        .forEach((suggestion, index) => {
          const priority =
            suggestion.priority === "high"
              ? "🔥"
              : suggestion.priority === "medium"
              ? "⚠️"
              : "ℹ️";
          formatted += `   ${index + 1}. ${priority} ${suggestion.action}: ${
            suggestion.description
          }\n`;
        });
    }

    return formatted;
  }

  /**
   * Check if error is an Axios error
   */
  private static isAxiosError(error: any): error is AxiosError {
    return error && typeof error === "object" && error.isAxiosError === true;
  }

  /**
   * Check if response indicates rate limiting
   */
  private static isRateLimited(response: any): boolean {
    return (
      response.headers?.["x-ratelimit-remaining"] === "0" ||
      (response.data?.message &&
        response.data.message.toLowerCase().includes("rate limit"))
    );
  }

  /**
   * Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Handle LLM service errors (JAN server issues)
   */
  static handleLLMServiceError(
    error: any,
    context: ErrorContext
  ): ScraperError {
    let message: string;
    let suggestions: ErrorSuggestion[] = [];
    let isRetryable = false;

    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      message = `Cannot connect to LLM service at ${
        context.additionalInfo?.endpoint || "unknown endpoint"
      }. Is JAN running?`;
      suggestions = [
        {
          action: "Start JAN server",
          description: "Ensure JAN is running on your machine",
          priority: "high",
        },
        {
          action: "Check endpoint configuration",
          description: `Verify the JAN endpoint (${
            context.additionalInfo?.endpoint || "unknown"
          }) is correct`,
          priority: "high",
        },
        {
          action: "Install JAN",
          description:
            "If JAN is not installed, visit https://jan.ai to download and install it",
          priority: "medium",
        },
      ];
      isRetryable = true;
    } else if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      message =
        "LLM service request timed out. JAN may be overloaded or processing a large request.";
      suggestions = [
        {
          action: "Increase timeout",
          description: "Configure a longer timeout for LLM operations",
          priority: "high",
        },
        {
          action: "Reduce batch size",
          description: "Process fewer issues at once to reduce LLM load",
          priority: "high",
        },
        {
          action: "Check JAN resources",
          description: "Ensure JAN has sufficient system resources (CPU/RAM)",
          priority: "medium",
        },
      ];
      isRetryable = true;
    } else if (error.response?.status === 404) {
      message =
        "LLM API endpoint not found. JAN may not support the OpenAI-compatible API.";
      suggestions = [
        {
          action: "Check JAN version",
          description:
            "Ensure you're using a JAN version with OpenAI-compatible API",
          priority: "high",
        },
        {
          action: "Check endpoint URL",
          description: "Verify the JAN endpoint URL is correct",
          priority: "high",
        },
        {
          action: "Update JAN",
          description: "Update to the latest version of JAN",
          priority: "medium",
        },
      ];
    } else if (error.response?.status === 429) {
      message = "LLM service rate limit exceeded or insufficient resources.";
      suggestions = [
        {
          action: "Wait and retry",
          description:
            "JAN is processing too many requests, wait and try again",
          priority: "high",
        },
        {
          action: "Check JAN resources",
          description: "Ensure JAN has sufficient system resources",
          priority: "medium",
        },
        {
          action: "Reduce batch size",
          description: "Process fewer issues at once to reduce LLM load",
          priority: "medium",
        },
      ];
      isRetryable = true;
    } else {
      message = `LLM service error: ${
        error.message || "Unknown LLM service issue"
      }`;
      suggestions = [
        {
          action: "Check JAN logs",
          description: "Check JAN application logs for errors",
          priority: "high",
        },
        {
          action: "Restart JAN",
          description: "Try restarting the JAN application",
          priority: "medium",
        },
      ];
      isRetryable = true;
    }

    return new ScraperError(
      ErrorType.LLM_SERVICE,
      message,
      context,
      suggestions,
      isRetryable,
      error
    );
  }

  /**
   * Handle LLM response format errors
   */
  static handleLLMResponseError(
    error: any,
    context: ErrorContext
  ): ScraperError {
    let message: string;
    let suggestions: ErrorSuggestion[] = [];
    let isRetryable = true;

    if (error.message?.includes("JSON")) {
      message = "Failed to parse LLM response as valid JSON.";
      suggestions = [
        {
          action: "Retry with clearer prompt",
          description: "Retry with a more structured prompt format",
          priority: "high",
        },
        {
          action: "Check response format",
          description: "Ensure the prompt specifies JSON output format",
          priority: "high",
        },
        {
          action: "Reduce complexity",
          description:
            "Simplify the request to reduce chance of malformed output",
          priority: "medium",
        },
      ];
    } else if (
      error.message?.includes("missing") ||
      error.message?.includes("required")
    ) {
      message = "LLM response is missing required fields.";
      suggestions = [
        {
          action: "Update prompt",
          description:
            "Modify prompt to explicitly request all required fields",
          priority: "high",
        },
        {
          action: "Add validation",
          description: "Implement fallback values for missing fields",
          priority: "medium",
        },
      ];
    } else {
      message = `LLM response error: ${
        error.message || "Invalid or unexpected LLM response format"
      }`;
      suggestions = [
        {
          action: "Check prompt structure",
          description:
            "Verify the prompt clearly specifies the expected response format",
          priority: "high",
        },
        {
          action: "Simplify request",
          description: "Break down complex requests into simpler components",
          priority: "medium",
        },
      ];
    }

    return new ScraperError(
      ErrorType.LLM_RESPONSE,
      message,
      context,
      suggestions,
      isRetryable,
      error
    );
  }

  /**
   * Handle LLM context length errors
   */
  static handleLLMContextError(
    error: any,
    context: ErrorContext
  ): ScraperError {
    const message = "LLM context length exceeded during analysis.";
    const suggestions: ErrorSuggestion[] = [
      {
        action: "Reduce batch size",
        description:
          "Process fewer issues at once to fit within context limits",
        priority: "high",
      },
      {
        action: "Use a model with larger context window",
        description: "Switch to a model that can handle more tokens",
        priority: "high",
      },
      {
        action: "Simplify issue data",
        description:
          "Truncate or summarize issue content before sending to LLM",
        priority: "medium",
      },
    ];

    return new ScraperError(
      ErrorType.LLM_CONTEXT,
      message,
      context,
      suggestions,
      true, // Retryable
      error
    );
  }
}
