import axios from "axios";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { GitHubClient } from "../github-client";
import { ReportGenerator } from "../report-generator";
import { ConfigManager } from "../config";
import { AuthenticationService } from "../auth";
import { ErrorHandler, ScraperError, ErrorType } from "../error-handler";
import { GitHubIssue, Comment, Config } from "../../models";

// Mock axios for controlled testing
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

// TODO: Re-enable after LLM analysis is implemented in task 4
describe("Full Integration Tests", () => {
  let mockAxiosInstance: any;
  let tempConfigDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create temporary config directory
    tempConfigDir = path.join(os.tmpdir(), `github-scraper-test-${Date.now()}`);
  });

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock setTimeout to avoid delays
    jest.spyOn(global, "setTimeout").mockImplementation((callback: any) => {
      callback();
      return {} as any;
    });

    // Create mock axios instance with all required methods
    mockAxiosInstance = {
      request: jest.fn(),
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
      head: jest.fn(),
      options: jest.fn(),
      interceptors: {
        request: { use: jest.fn(), eject: jest.fn() },
        response: { use: jest.fn(), eject: jest.fn() },
      },
      defaults: {},
    };

    // Mock axios.create to return our mock instance
    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    // Reset environment variables
    process.env = { ...originalEnv };
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.PRODUCT_AREA;
  });

  afterEach(() => {
    // Restore mocks after each test
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    // Restore original environment
    process.env = originalEnv;

    // Clean up temp directory
    if (await fs.pathExists(tempConfigDir)) {
      await fs.remove(tempConfigDir);
    }
  });

  it("should be re-enabled after LLM implementation", () => {
    expect(true).toBe(true);
  });

  describe("Authentication Flow Tests", () => {
    it("should validate authentication flow with valid token", async () => {
      // Mock successful authentication
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url === "/user") {
          return Promise.resolve({
            data: {
              login: "validuser",
              name: "Valid User",
              email: "valid@example.com",
            },
            headers: {
              "x-ratelimit-limit": "5000",
              "x-ratelimit-remaining": "4500",
              "x-ratelimit-reset": Math.floor(Date.now() / 1000) + 3600,
            },
          });
        }
        if (url === "/repos/test-owner/test-repo") {
          return Promise.resolve({
            data: { id: 123, name: "test-repo", private: false },
          });
        }
        return Promise.reject(new Error("Unexpected URL"));
      });

      const authService = new AuthenticationService();

      // Test token validation
      const authResult = await authService.validateToken("valid-token");
      expect(authResult.isValid).toBe(true);
      expect(authResult.user?.login).toBe("validuser");
      expect(authResult.rateLimit?.remaining).toBe(4500);

      // Test repository access
      const repoAccess = await authService.testRepositoryAccess(
        "valid-token",
        "test-owner/test-repo"
      );
      expect(repoAccess.hasAccess).toBe(true);
    });

    it("should handle authentication failures gracefully", async () => {
      // Mock authentication failure
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url === "/user") {
          const error = new Error("Bad credentials");
          (error as any).response = {
            status: 401,
            data: { message: "Bad credentials" },
          };
          return Promise.reject(error);
        }
        return Promise.reject(new Error("Unexpected URL"));
      });

      const authService = new AuthenticationService();

      const authResult = await authService.validateToken("invalid-token");
      expect(authResult.isValid).toBe(false);
      expect(authResult.error).toBeDefined();
    });

    it("should handle repository access denied", async () => {
      // Mock successful user auth but repo access denied
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url === "/user") {
          return Promise.resolve({
            data: { login: "testuser", name: "Test User" },
            headers: {
              "x-ratelimit-limit": "5000",
              "x-ratelimit-remaining": "4999",
              "x-ratelimit-reset": Math.floor(Date.now() / 1000) + 3600,
            },
          });
        }
        if (url === "/repos/private-owner/private-repo") {
          const error = new Error("Not Found");
          (error as any).response = {
            status: 404,
            data: { message: "Not Found" },
          };
          return Promise.reject(error);
        }
        return Promise.reject(new Error("Unexpected URL"));
      });

      const authService = new AuthenticationService();

      // Token should be valid
      const authResult = await authService.validateToken("valid-token");
      expect(authResult.isValid).toBe(true);

      // But repository access should fail
      const repoAccess = await authService.testRepositoryAccess(
        "valid-token",
        "private-owner/private-repo"
      );
      expect(repoAccess.hasAccess).toBe(false);
      expect(repoAccess.error).toBeDefined();
    });
  });

  describe("Rate Limiting and Error Recovery Tests", () => {
    it("should handle rate limiting with exponential backoff", async () => {
      let callCount = 0;
      mockAxiosInstance.request.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          // First two calls hit rate limit
          const error = new Error("API rate limit exceeded");
          (error as any).response = {
            status: 403,
            headers: {
              "x-ratelimit-remaining": "0",
              "x-ratelimit-reset": Math.floor(Date.now() / 1000) + 60,
            },
            data: { message: "API rate limit exceeded" },
          };
          return Promise.reject(error);
        }
        // Third call succeeds
        return Promise.resolve({ data: [] });
      });

      const githubClient = new GitHubClient("test-token");

      // Should eventually succeed after retries
      const issues = await githubClient.getRepositoryIssues(
        "test-owner/test-repo"
      );
      expect(issues).toEqual([]);
      expect(callCount).toBe(3);
    });

    it("should handle network errors with retry mechanism", async () => {
      let callCount = 0;
      mockAxiosInstance.request.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call has network error
          const error = new Error("Network Error");
          (error as any).code = "ECONNRESET";
          return Promise.reject(error);
        }
        // Second call succeeds
        return Promise.resolve({ data: [] });
      });

      const githubClient = new GitHubClient("test-token");

      const issues = await githubClient.getRepositoryIssues(
        "test-owner/test-repo"
      );
      expect(issues).toEqual([]);
      expect(callCount).toBe(2);
    });

    it("should give up after maximum retry attempts", async () => {
      // Always fail with retryable error
      mockAxiosInstance.request.mockImplementation(() => {
        const error = new Error("Persistent network error");
        (error as any).code = "ECONNRESET";
        return Promise.reject(error);
      });

      const githubClient = new GitHubClient("test-token");

      await expect(
        githubClient.getRepositoryIssues("test-owner/test-repo")
      ).rejects.toThrow();
    });
  });

  describe("Large Repository Handling and Performance Tests", () => {
    it("should handle large repository with pagination", async () => {
      // Mock large dataset with pagination
      const createMockIssues = (page: number, perPage: number) => {
        const issues = [];
        const start = (page - 1) * perPage;
        for (let i = start; i < start + perPage && i < 250; i++) {
          issues.push({
            id: i + 1,
            number: i + 1,
            title: `Issue ${i + 1}`,
            body: `Description for issue ${i + 1}`,
            labels: [{ name: "bug", color: "red" }],
            state: "open",
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-02T00:00:00Z",
            user: { login: `user${i + 1}` },
            html_url: `https://github.com/large-owner/large-repo/issues/${
              i + 1
            }`,
            comments: 0,
          });
        }
        return issues;
      };

      mockAxiosInstance.request.mockImplementation((config: any) => {
        const page = config.params?.page || 1;
        const perPage = config.params?.per_page || 100;
        const issues = createMockIssues(page, perPage);

        return Promise.resolve({ data: issues });
      });

      const githubClient = new GitHubClient("test-token");

      // Test with pagination - the client fetches all pages by default
      const issues = await githubClient.getRepositoryIssues(
        "large-owner/large-repo"
      );

      // Should get all results (250 total as per createMockIssues logic)
      expect(issues.length).toBe(250);
      expect(issues[0].number).toBe(1);
      expect(issues[99].number).toBe(100);
      expect(issues[249].number).toBe(250);
    });

    it("should handle timeout scenarios gracefully", async () => {
      // Mock timeout error
      mockAxiosInstance.request.mockImplementation(() => {
        const error = new Error("timeout of 30000ms exceeded");
        (error as any).code = "ECONNABORTED";
        return Promise.reject(error);
      });

      const githubClient = new GitHubClient("test-token");

      await expect(
        githubClient.getRepositoryIssues("slow-owner/slow-repo")
      ).rejects.toThrow();
    });
  });
});
