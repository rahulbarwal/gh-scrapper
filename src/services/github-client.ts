import axios, { AxiosInstance, AxiosResponse } from "axios";
import { GitHubIssue, Comment } from "../models";
import {
  ErrorHandler,
  ScraperError,
  ErrorType,
  ErrorContext,
} from "./error-handler";

export interface GitHubApiIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  labels: Array<{ name: string; color: string }>;
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
  user: { login: string };
  html_url: string;
  comments: number;
}

export interface GitHubApiComment {
  id: number;
  user: { login: string; type: string };
  body: string;
  created_at: string;
  author_association: string;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
}

export interface PaginationOptions {
  page?: number;
  perPage?: number;
  maxPages?: number;
}

export interface IssueFilters {
  state?: "open" | "closed" | "all";
  labels?: string;
  sort?: "created" | "updated" | "comments";
  direction?: "asc" | "desc";
  since?: string;
}

export interface SearchOptions {
  query: string;
  repository: string;
  state?: "open" | "closed";
  sort?: "created" | "updated" | "comments";
  order?: "asc" | "desc";
  perPage?: number;
  maxResults?: number;
}

export interface GitHubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubApiIssue[];
}

export class GitHubApiError extends Error {
  constructor(message: string, public status?: number, public response?: any) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export class GitHubClient {
  private client: AxiosInstance;
  private token: string;
  private baseDelay = 1000; // Base delay for exponential backoff (1 second)
  private maxRetries = 5;

  constructor(token: string) {
    this.token = token;
    this.client = axios.create({
      baseURL: "https://api.github.com",
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "github-issue-scraper/1.0.0",
      },
      timeout: 30000,
    });

    // Add response interceptor for rate limiting
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (
          error.response?.status === 403 &&
          this.isRateLimited(error.response)
        ) {
          return this.handleRateLimit(error);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Fetch repository issues with pagination support
   */
  async getRepositoryIssues(
    repository: string,
    filters: IssueFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<GitHubIssue[]> {
    const context: ErrorContext = {
      operation: "fetching repository issues",
      repository,
    };

    return ErrorHandler.executeWithRetry(async () => {
      const [owner, repo] = this.parseRepository(repository);
      const issues: GitHubIssue[] = [];

      const { page = 1, perPage = 100, maxPages = 10 } = pagination;

      const {
        state = "open",
        labels,
        sort = "updated",
        direction = "desc",
        since,
      } = filters;

      let currentPage = page;
      let hasNextPage = true;

      while (hasNextPage && currentPage <= maxPages) {
        const params: any = {
          state,
          sort,
          direction,
          page: currentPage,
          per_page: perPage,
        };

        if (labels) params.labels = labels;
        if (since) params.since = since;

        const response = await this.makeRequest<GitHubApiIssue[]>(
          `/repos/${owner}/${repo}/issues`,
          { params }
        );

        // Transform issues with error handling for malformed data
        const pageIssues: GitHubIssue[] = [];
        for (const apiIssue of response.data) {
          try {
            pageIssues.push(this.transformIssue(apiIssue));
          } catch (error) {
            // Handle malformed issue data gracefully
            const parseContext: ErrorContext = {
              operation: "parsing issue data",
              repository,
              issueId: apiIssue.id,
            };
            console.warn(
              ErrorHandler.formatError(
                ErrorHandler.handleParsingError(error, parseContext, apiIssue),
                false
              )
            );
            // Continue processing other issues
          }
        }

        issues.push(...pageIssues);

        // Check if there are more pages
        hasNextPage = response.data.length === perPage;
        currentPage++;

        // Log progress for large repositories
        if (issues.length > 0 && issues.length % 100 === 0) {
          console.log(`Fetched ${issues.length} issues...`);
        }
      }

      return issues;
    }, context);
  }

  /**
   * Retrieve all comments for a specific issue
   */
  async getIssueComments(
    repository: string,
    issueNumber: number
  ): Promise<Comment[]> {
    const context: ErrorContext = {
      operation: "fetching issue comments",
      repository,
      issueId: issueNumber,
    };

    return ErrorHandler.executeWithRetry(async () => {
      const [owner, repo] = this.parseRepository(repository);
      const comments: Comment[] = [];

      let page = 1;
      let hasNextPage = true;

      while (hasNextPage) {
        const response = await this.makeRequest<GitHubApiComment[]>(
          `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
          {
            params: {
              page,
              per_page: 100,
            },
          }
        );

        // Transform comments with error handling for malformed data
        for (const apiComment of response.data) {
          try {
            comments.push(this.transformComment(apiComment));
          } catch (error) {
            // Handle malformed comment data gracefully
            const parseContext: ErrorContext = {
              operation: "parsing comment data",
              repository,
              issueId: issueNumber,
              additionalInfo: { commentId: apiComment.id },
            };
            console.warn(
              ErrorHandler.formatError(
                ErrorHandler.handleParsingError(
                  error,
                  parseContext,
                  apiComment
                ),
                false
              )
            );
            // Continue processing other comments
          }
        }

        hasNextPage = response.data.length === 100;
        page++;
      }

      return comments;
    }, context);
  }

  /**
   * Search for issues using GitHub's search API
   */
  async searchIssues(options: SearchOptions): Promise<GitHubIssue[]> {
    const context: ErrorContext = {
      operation: "searching issues",
      repository: options.repository,
      productArea: options.query,
    };

    return ErrorHandler.executeWithRetry(async () => {
      const issues: GitHubIssue[] = [];
      const maxResults = options.maxResults || 100;
      const perPage = Math.min(options.perPage || 100, 100); // GitHub API max is 100

      // Build search query
      const searchQuery = this.buildSearchQuery(options);

      let page = 1;
      let hasNextPage = true;

      while (hasNextPage && issues.length < maxResults) {
        const params = {
          q: searchQuery,
          sort: options.sort || "updated",
          order: options.order || "desc",
          page,
          per_page: perPage,
        };

        const response = await this.makeRequest<GitHubSearchResponse>(
          "/search/issues",
          { params }
        );

        // Transform search results with error handling for malformed data
        const pageIssues: GitHubIssue[] = [];
        for (const apiIssue of response.data.items) {
          try {
            pageIssues.push(this.transformIssue(apiIssue));
          } catch (error) {
            // Handle malformed issue data gracefully
            const parseContext: ErrorContext = {
              operation: "parsing search result",
              repository: options.repository,
              issueId: apiIssue.id,
            };
            console.warn(
              ErrorHandler.formatError(
                ErrorHandler.handleParsingError(error, parseContext, apiIssue),
                false
              )
            );
            // Continue processing other issues
          }
        }

        issues.push(...pageIssues);

        // Check if there are more pages and we haven't hit our limit
        hasNextPage =
          response.data.items.length === perPage &&
          issues.length < maxResults &&
          page < 10; // GitHub search API has a 1000 result limit (10 pages * 100 per page)

        page++;

        // Log progress
        if (issues.length > 0 && issues.length % 50 === 0) {
          console.log(`Found ${issues.length} matching issues...`);
        }
      }

      // Limit to requested max results
      return issues.slice(0, maxResults);
    }, context);
  }

  /**
   * Build GitHub search query string
   */
  private buildSearchQuery(options: SearchOptions): string {
    const queryParts: string[] = [];

    // Add the main search terms
    queryParts.push(options.query);

    // Add repository filter
    queryParts.push(`repo:${options.repository}`);

    // Add type filter (issues only, not pull requests)
    queryParts.push("type:issue");

    // Add state filter
    if (options.state) {
      queryParts.push(`state:${options.state}`);
    } else {
      queryParts.push("state:open"); // Default to open issues
    }

    return queryParts.join(" ");
  }

  /**
   * Get current rate limit information
   */
  async getRateLimitInfo(): Promise<RateLimitInfo> {
    const context: ErrorContext = {
      operation: "fetching rate limit information",
    };

    return ErrorHandler.executeWithRetry(async () => {
      const response = await this.makeRequest<any>("/rate_limit");
      const rateLimit = response.data.rate;

      return {
        limit: rateLimit.limit,
        remaining: rateLimit.remaining,
        reset: new Date(rateLimit.reset * 1000),
      };
    }, context);
  }

  /**
   * Make authenticated request with comprehensive error handling
   */
  private async makeRequest<T>(
    url: string,
    config: any = {}
  ): Promise<AxiosResponse<T>> {
    const context: ErrorContext = {
      operation: `making API request to ${url}`,
    };

    return ErrorHandler.executeWithRetry(async () => {
      try {
        // Add request validation
        if (!url || typeof url !== "string") {
          throw ErrorHandler.handleValidationError(
            "Invalid URL provided for API request",
            context,
            [
              {
                action: "Check URL format",
                description: "Ensure the API endpoint URL is valid",
                priority: "high",
              },
            ]
          );
        }

        // Add timeout and retry configuration
        const requestConfig = {
          url,
          method: "GET",
          timeout: 30000, // 30 second timeout
          ...config,
        };

        return await this.client.request<T>(requestConfig);
      } catch (error: any) {
        // Add specific handling for common GitHub API errors
        if (error.response?.status === 422) {
          // Unprocessable Entity - often validation errors
          throw ErrorHandler.handleValidationError(
            `GitHub API validation error: ${
              error.response.data?.message || "Invalid request parameters"
            }`,
            context,
            [
              {
                action: "Check request parameters",
                description: "Verify that all request parameters are valid",
                priority: "high",
              },
              {
                action: "Check API documentation",
                description:
                  "Refer to GitHub API documentation for correct parameter format",
                priority: "medium",
              },
            ]
          );
        }

        // Convert to ScraperError for consistent handling
        throw ErrorHandler.convertToScraperError(error, context);
      }
    }, context);
  }

  /**
   * Check if error is rate limiting (used by interceptor)
   */
  private isRateLimited(response: any): boolean {
    return (
      response.headers["x-ratelimit-remaining"] === "0" ||
      (response.data &&
        response.data.message &&
        response.data.message.toLowerCase().includes("rate limit"))
    );
  }

  /**
   * Handle rate limiting by waiting for reset (used by interceptor)
   */
  private async handleRateLimit(error: any): Promise<any> {
    const resetTime = error.response.headers["x-ratelimit-reset"];
    const remaining = error.response.headers["x-ratelimit-remaining"];

    if (remaining === "0" && resetTime) {
      const resetDate = new Date(parseInt(resetTime, 10) * 1000);
      const waitTime = resetDate.getTime() - Date.now();

      if (waitTime > 0 && waitTime < 3600000) {
        // Don't wait more than 1 hour
        console.log(
          `Rate limit exceeded. Waiting ${Math.ceil(
            waitTime / 1000
          )} seconds until reset...`
        );
        await this.sleep(waitTime);
        return this.client.request(error.config);
      }
    }

    throw error;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Parse repository string into owner and repo
   */
  private parseRepository(repository: string): [string, string] {
    const parts = repository.split("/");
    if (parts.length !== 2) {
      throw new GitHubApiError(
        `Invalid repository format: ${repository}. Expected format: owner/repo`
      );
    }
    return [parts[0], parts[1]];
  }

  /**
   * Transform GitHub API issue to internal format
   */
  private transformIssue = (apiIssue: GitHubApiIssue): GitHubIssue => {
    return {
      id: apiIssue.id,
      number: apiIssue.number,
      title: apiIssue.title,
      description: apiIssue.body || "",
      labels: apiIssue.labels.map((label) => label.name),
      state: apiIssue.state,
      createdAt: new Date(apiIssue.created_at),
      updatedAt: new Date(apiIssue.updated_at),
      author: apiIssue.user.login,
      url: apiIssue.html_url,
      comments: [], // Will be populated separately
      // LLM-generated fields - will be populated by JAN analysis
      relevanceScore: 0,
      category: "uncategorized",
      priority: "medium",
      summary: "",
      workarounds: [],
      tags: [],
      sentiment: "neutral",
    };
  };

  /**
   * Transform GitHub API comment to internal format
   */
  private transformComment = (apiComment: GitHubApiComment): Comment => {
    // Determine author type based on association
    let authorType: "maintainer" | "contributor" | "user";
    switch (apiComment.author_association) {
      case "OWNER":
      case "MEMBER":
      case "COLLABORATOR":
        authorType = "maintainer";
        break;
      case "CONTRIBUTOR":
        authorType = "contributor";
        break;
      default:
        authorType = "user";
    }

    return {
      id: apiComment.id,
      author: apiComment.user.login,
      body: apiComment.body,
      createdAt: new Date(apiComment.created_at),
      authorType,
    };
  };
}
