import axios, { AxiosInstance } from "axios";
import { ErrorHandler, ErrorContext } from "./error-handler";

export interface AuthValidationResult {
  isValid: boolean;
  user?: {
    login: string;
    name: string;
    email: string;
  };
  rateLimit?: {
    limit: number;
    remaining: number;
    reset: Date;
  };
  error?: string;
}

export class AuthenticationService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: "https://api.github.com",
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "github-issue-scraper/1.0.0",
      },
      timeout: 10000,
    });
  }

  /**
   * Validate GitHub token by testing authentication with GitHub API
   */
  async validateToken(token: string): Promise<AuthValidationResult> {
    const context: ErrorContext = {
      operation: "validating GitHub token",
    };

    try {
      // Test authentication by getting user info
      const response = await this.client.get("/user", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Extract rate limit information from headers
      const rateLimit = {
        limit: parseInt(response.headers["x-ratelimit-limit"] || "0", 10),
        remaining: parseInt(
          response.headers["x-ratelimit-remaining"] || "0",
          10
        ),
        reset: new Date(
          parseInt(response.headers["x-ratelimit-reset"] || "0", 10) * 1000
        ),
      };

      return {
        isValid: true,
        user: {
          login: response.data.login,
          name: response.data.name || response.data.login,
          email: response.data.email || "",
        },
        rateLimit,
      };
    } catch (error: any) {
      // Use centralized error handling
      const scraperError = ErrorHandler.convertToScraperError(error, context);

      return {
        isValid: false,
        error: scraperError.message,
      };
    }
  }

  /**
   * Test repository access with the given token
   */
  async testRepositoryAccess(
    token: string,
    repository: string
  ): Promise<{ hasAccess: boolean; error?: string }> {
    const context: ErrorContext = {
      operation: "testing repository access",
      repository,
    };

    try {
      // Extract owner and repo from repository string (e.g., "owner/repo")
      const [owner, repo] = repository.split("/");

      if (!owner || !repo) {
        const validationError = ErrorHandler.handleValidationError(
          "Invalid repository format. Expected format: owner/repository",
          context,
          [
            {
              action: "Check repository format",
              description:
                "Repository should be in format 'owner/repository-name'",
              priority: "high",
            },
          ]
        );
        return {
          hasAccess: false,
          error: validationError.message,
        };
      }

      await this.client.get(`/repos/${owner}/${repo}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return { hasAccess: true };
    } catch (error: any) {
      // Use centralized error handling
      const scraperError = ErrorHandler.convertToScraperError(error, context);

      return {
        hasAccess: false,
        error: scraperError.message,
      };
    }
  }

  /**
   * Get authenticated GitHub client instance
   */
  getAuthenticatedClient(token: string): AxiosInstance {
    return axios.create({
      baseURL: "https://api.github.com",
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "github-issue-scraper/1.0.0",
      },
      timeout: 30000,
    });
  }
}
