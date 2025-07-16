import axios, { AxiosInstance, AxiosResponse } from "axios";
import { GitHubIssue, Comment } from "../models";

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
      try {
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

        const pageIssues = response.data.map(this.transformIssue);
        issues.push(...pageIssues);

        // Check if there are more pages
        hasNextPage = response.data.length === perPage;
        currentPage++;

        // Log progress for large repositories
        if (issues.length > 0 && issues.length % 100 === 0) {
          console.log(`Fetched ${issues.length} issues...`);
        }
      } catch (error) {
        throw this.handleApiError(error, `fetching issues for ${repository}`);
      }
    }

    return issues;
  }

  /**
   * Retrieve all comments for a specific issue
   */
  async getIssueComments(
    repository: string,
    issueNumber: number
  ): Promise<Comment[]> {
    const [owner, repo] = this.parseRepository(repository);
    const comments: Comment[] = [];

    let page = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      try {
        const response = await this.makeRequest<GitHubApiComment[]>(
          `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
          {
            params: {
              page,
              per_page: 100,
            },
          }
        );

        const pageComments = response.data.map(this.transformComment);
        comments.push(...pageComments);

        hasNextPage = response.data.length === 100;
        page++;
      } catch (error) {
        throw this.handleApiError(
          error,
          `fetching comments for issue #${issueNumber} in ${repository}`
        );
      }
    }

    return comments;
  }

  /**
   * Get current rate limit information
   */
  async getRateLimitInfo(): Promise<RateLimitInfo> {
    try {
      const response = await this.makeRequest<any>("/rate_limit");
      const rateLimit = response.data.rate;

      return {
        limit: rateLimit.limit,
        remaining: rateLimit.remaining,
        reset: new Date(rateLimit.reset * 1000),
      };
    } catch (error) {
      throw this.handleApiError(error, "fetching rate limit information");
    }
  }

  /**
   * Make authenticated request with error handling
   */
  private async makeRequest<T>(
    url: string,
    config: any = {},
    retryCount = 0
  ): Promise<AxiosResponse<T>> {
    try {
      return await this.client.request<T>({
        url,
        method: "GET",
        ...config,
      });
    } catch (error: any) {
      // Handle rate limiting with exponential backoff
      if (
        error.response?.status === 403 &&
        this.isRateLimited(error.response)
      ) {
        if (retryCount < this.maxRetries) {
          await this.waitForRateLimit(error.response, retryCount);
          return this.makeRequest<T>(url, config, retryCount + 1);
        }
      }

      // Handle other retryable errors (network issues, temporary server errors)
      if (this.isRetryableError(error) && retryCount < this.maxRetries) {
        const delay = this.calculateBackoffDelay(retryCount);
        console.log(
          `Request failed, retrying in ${delay}ms... (attempt ${
            retryCount + 1
          }/${this.maxRetries})`
        );
        await this.sleep(delay);
        return this.makeRequest<T>(url, config, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Handle rate limiting by waiting for reset or using exponential backoff
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
   * Wait for rate limit reset or apply exponential backoff
   */
  private async waitForRateLimit(
    response: any,
    retryCount: number
  ): Promise<void> {
    const resetTime = response.headers["x-ratelimit-reset"];
    const remaining = response.headers["x-ratelimit-remaining"];

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
        return;
      }
    }

    // Fallback to exponential backoff
    const delay = this.calculateBackoffDelay(retryCount);
    console.log(`Rate limited, using exponential backoff: ${delay}ms`);
    await this.sleep(delay);
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoffDelay(retryCount: number): number {
    return this.baseDelay * Math.pow(2, retryCount) + Math.random() * 1000;
  }

  /**
   * Check if error is rate limiting
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
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error.response) {
      // Network errors are retryable
      return true;
    }

    const status = error.response.status;
    // Retry on server errors and some client errors
    return status >= 500 || status === 408 || status === 429;
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
      title: apiIssue.title,
      description: apiIssue.body || "",
      labels: apiIssue.labels.map((label) => label.name),
      state: apiIssue.state,
      createdAt: new Date(apiIssue.created_at),
      updatedAt: new Date(apiIssue.updated_at),
      author: apiIssue.user.login,
      url: apiIssue.html_url,
      comments: [], // Will be populated separately
      relevanceScore: 0, // Will be calculated by relevance filter
      summary: "", // Will be generated by issue parser
      workarounds: [], // Will be extracted by issue parser
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
      isWorkaround: false, // Will be determined by issue parser
      authorType,
    };
  };

  /**
   * Handle API errors and provide meaningful error messages
   */
  private handleApiError(error: any, context: string): GitHubApiError {
    if (!error.response) {
      return new GitHubApiError(
        `Network error while ${context}: ${error.message}`
      );
    }

    const status = error.response.status;
    const data = error.response.data;

    let message: string;
    switch (status) {
      case 401:
        message = `Authentication failed while ${context}. Please check your GitHub token.`;
        break;
      case 403:
        if (this.isRateLimited(error.response)) {
          message = `Rate limit exceeded while ${context}. Please wait before retrying.`;
        } else {
          message = `Access forbidden while ${context}. You may not have permission to access this resource.`;
        }
        break;
      case 404:
        message = `Resource not found while ${context}. Please check the repository name and your access permissions.`;
        break;
      case 422:
        message = `Invalid request while ${context}: ${
          data?.message || "Validation failed"
        }`;
        break;
      default:
        message = `GitHub API error while ${context}: ${status} - ${
          data?.message || error.response.statusText
        }`;
    }

    return new GitHubApiError(message, status, error.response);
  }
}
