import axios, { AxiosInstance } from "axios";

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
      let errorMessage = "Unknown authentication error";

      if (error.response) {
        switch (error.response.status) {
          case 401:
            errorMessage =
              "Invalid GitHub token. Please check your token and try again.";
            break;
          case 403:
            errorMessage =
              "GitHub token lacks required permissions or rate limit exceeded.";
            break;
          case 404:
            errorMessage =
              "GitHub API endpoint not found. Please check your network connection.";
            break;
          default:
            errorMessage = `GitHub API error: ${error.response.status} - ${error.response.statusText}`;
        }
      } else if (error.code === "ECONNABORTED") {
        errorMessage = "Request timeout. Please check your network connection.";
      } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
        errorMessage = "Network error. Please check your internet connection.";
      }

      return {
        isValid: false,
        error: errorMessage,
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
    try {
      // Extract owner and repo from repository string (e.g., "owner/repo")
      const [owner, repo] = repository.split("/");

      if (!owner || !repo) {
        return {
          hasAccess: false,
          error: "Invalid repository format. Expected format: owner/repository",
        };
      }

      await this.client.get(`/repos/${owner}/${repo}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return { hasAccess: true };
    } catch (error: any) {
      let errorMessage = "Unknown repository access error";

      if (error.response) {
        switch (error.response.status) {
          case 401:
            errorMessage =
              "Authentication failed. Please check your GitHub token.";
            break;
          case 403:
            errorMessage =
              "Access denied. You may not have permission to access this repository.";
            break;
          case 404:
            errorMessage =
              "Repository not found. Please check the repository name and your access permissions.";
            break;
          default:
            errorMessage = `Repository access error: ${error.response.status} - ${error.response.statusText}`;
        }
      }

      return {
        hasAccess: false,
        error: errorMessage,
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
