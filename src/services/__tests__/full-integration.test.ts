import axios from "axios";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { GitHubClient } from "../github-client";
import { RelevanceFilter } from "../relevance-filter";
import { IssueParser } from "../issue-parser";
import { ReportGenerator } from "../report-generator";
import { ConfigManager } from "../config";
import { AuthenticationService } from "../auth";
import { ErrorHandler, ScraperError, ErrorType } from "../error-handler";
import { GitHubIssueScraperCLI } from "../../cli";
import { GitHubIssue, Comment, Config } from "../../models";

// Mock axios for controlled testing
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock setTimeout to avoid actual delays in tests
const originalSetTimeout = global.setTimeout;

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

  describe("End-to-End Workflow Tests", () => {
    it("should complete full scraping workflow with test repository", async () => {
      // Mock authentication response
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url === "/user") {
          return Promise.resolve({
            data: {
              login: "testuser",
              name: "Test User",
              email: "test@example.com",
            },
            headers: {
              "x-ratelimit-limit": "5000",
              "x-ratelimit-remaining": "4999",
              "x-ratelimit-reset": Math.floor(Date.now() / 1000) + 3600,
            },
          });
        }
        if (url === "/repos/test-owner/test-repo") {
          return Promise.resolve({
            data: {
              id: 123,
              name: "test-repo",
              full_name: "test-owner/test-repo",
              private: false,
            },
          });
        }
        return Promise.reject(new Error("Unexpected URL"));
      });

      // Mock repository issues response
      const mockIssues: any[] = [
        {
          id: 1,
          number: 1,
          title: "Authentication bug in login flow",
          body: "Users cannot login with OAuth. This affects the authentication system.",
          labels: [
            { name: "bug", color: "red" },
            { name: "authentication", color: "blue" },
          ],
          state: "open",
          created_at: "2023-01-01T00:00:00Z",
          updated_at: "2023-01-02T00:00:00Z",
          user: { login: "user1" },
          html_url: "https://github.com/test-owner/test-repo/issues/1",
          comments: 3,
        },
        {
          id: 2,
          number: 2,
          title: "Performance issue with database queries",
          body: "Database queries are slow in the user authentication module.",
          labels: [
            { name: "performance", color: "yellow" },
            { name: "database", color: "green" },
          ],
          state: "open",
          created_at: "2023-01-03T00:00:00Z",
          updated_at: "2023-01-04T00:00:00Z",
          user: { login: "user2" },
          html_url: "https://github.com/test-owner/test-repo/issues/2",
          comments: 1,
        },
        {
          id: 3,
          number: 3,
          title: "UI styling problem in header",
          body: "Header styling is broken on mobile devices.",
          labels: [{ name: "ui", color: "purple" }],
          state: "open",
          created_at: "2023-01-05T00:00:00Z",
          updated_at: "2023-01-06T00:00:00Z",
          user: { login: "user3" },
          html_url: "https://github.com/test-owner/test-repo/issues/3",
          comments: 0,
        },
      ];

      // Mock comments for issues
      const mockComments1 = [
        {
          id: 101,
          user: { login: "maintainer", type: "User" },
          body: "Workaround: Use the legacy login endpoint until we fix this.",
          created_at: "2023-01-01T12:00:00Z",
          author_association: "OWNER",
        },
        {
          id: 102,
          user: { login: "contributor", type: "User" },
          body: "I can confirm this issue. Here's a temporary fix: ```js\n// Use this code\nauth.fallback = true;\n```",
          created_at: "2023-01-02T08:00:00Z",
          author_association: "CONTRIBUTOR",
        },
        {
          id: 103,
          user: { login: "user4", type: "User" },
          body: "Thanks for the workaround, it works!",
          created_at: "2023-01-02T14:00:00Z",
          author_association: "NONE",
        },
      ];

      const mockComments2 = [
        {
          id: 201,
          user: { login: "developer", type: "User" },
          body: "Performance can be improved by adding an index on the auth_tokens table.",
          created_at: "2023-01-03T15:00:00Z",
          author_association: "MEMBER",
        },
      ];

      // Setup mock responses for the request method
      mockAxiosInstance.request
        .mockResolvedValueOnce({ data: mockIssues }) // Issues request
        .mockResolvedValueOnce({ data: mockComments1 }) // Comments for issue 1
        .mockResolvedValueOnce({ data: mockComments2 }) // Comments for issue 2
        .mockResolvedValueOnce({ data: [] }); // Comments for issue 3

      // Initialize services
      const githubClient = new GitHubClient("test-token");
      const relevanceFilter = new RelevanceFilter();
      const issueParser = new IssueParser();
      const reportGenerator = new ReportGenerator();

      // Execute the complete workflow
      const issues = await githubClient.getRepositoryIssues(
        "test-owner/test-repo"
      );
      expect(issues).toHaveLength(3);

      // Filter issues by product area "authentication" with lower threshold for testing
      const filterResult = relevanceFilter.filterIssuesWithFallback(issues, {
        productArea: "authentication",
        minRelevanceScore: 0.1, // Very low threshold for testing
        maxResults: 50,
      });
      const filteredIssues = filterResult.issues;

      // Should find authentication-related issues
      expect(filteredIssues.length).toBeGreaterThan(0);
      expect(filteredIssues[0].relevanceScore).toBeGreaterThan(0);

      // Parse issues and extract workarounds
      const parsedIssues: GitHubIssue[] = [];
      for (const issue of filteredIssues) {
        const comments = await githubClient.getIssueComments(
          "test-owner/test-repo",
          issue.number
        );
        const parsedContent = issueParser.parseIssueContent(issue);
        const workarounds = issueParser.extractWorkarounds(comments);
        const summary = issueParser.generateSummary(issue);

        parsedIssues.push({
          ...issue,
          comments,
          summary,
          workarounds,
        });
      }

      // Verify parsing results
      expect(parsedIssues.length).toBeGreaterThan(0);
      expect(parsedIssues[0].summary).toBeDefined();
      expect(parsedIssues[0].workarounds).toBeDefined();

      // Generate report
      const reportMetadata = {
        repositoryName: "test-repo",
        repositoryUrl: "https://github.com/test-owner/test-repo",
        productArea: "authentication",
        scrapeDate: new Date(),
        totalIssuesAnalyzed: issues.length,
        relevantIssuesFound: filteredIssues.length,
        minRelevanceScore: 30,
        generatedBy: "GitHub Issue Scraper v1.0.0",
      };

      const report = await reportGenerator.generateReport(
        parsedIssues,
        reportMetadata,
        {
          githubToken: "test-token",
          repository: "test-owner/test-repo",
          productArea: "authentication",
          maxIssues: 50,
          minRelevanceScore: 30,
          outputPath: "./reports",
        }
      );

      // Verify report generation
      expect(report).toContain("# GitHub Issues Report");
      expect(report).toContain("test-owner/test-repo");
      expect(report).toContain("authentication");
      expect(report).toContain("Authentication bug in login flow");

      // Verify API calls were made correctly
      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(3); // Issues + 2 comments calls
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2); // Auth + repo access
    });

    it("should handle empty results gracefully", async () => {
      // Mock authentication
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
        if (url === "/repos/empty-owner/empty-repo") {
          return Promise.resolve({
            data: {
              id: 456,
              name: "empty-repo",
              full_name: "empty-owner/empty-repo",
            },
          });
        }
        return Promise.reject(new Error("Unexpected URL"));
      });

      // Mock empty issues response
      mockAxiosInstance.request.mockResolvedValue({ data: [] });

      const githubClient = new GitHubClient("test-token");
      const relevanceFilter = new RelevanceFilter();

      const issues = await githubClient.getRepositoryIssues(
        "empty-owner/empty-repo"
      );
      expect(issues).toHaveLength(0);

      const filterResult = relevanceFilter.filterIssuesWithFallback(issues, {
        productArea: "nonexistent-feature",
        minRelevanceScore: 30,
        maxResults: 50,
      });

      expect(filterResult.issues).toHaveLength(0);
      expect(filterResult.hasResults).toBe(false);
    });
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

    it("should handle memory efficiently with large datasets", async () => {
      // Create a large mock dataset
      const largeIssueSet = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        number: i + 1,
        title: `Performance Issue ${i + 1}`,
        body: `This is a performance-related issue number ${
          i + 1
        } with detailed description that might be quite long to test memory usage.`,
        labels: [
          { name: "performance", color: "yellow" },
          { name: `category-${i % 10}`, color: "blue" },
        ],
        state: "open" as const,
        created_at: "2023-01-01T00:00:00Z",
        updated_at: "2023-01-02T00:00:00Z",
        user: { login: `user${i + 1}` },
        html_url: `https://github.com/perf-owner/perf-repo/issues/${i + 1}`,
        comments: i % 5, // Varying comment counts
      }));

      mockAxiosInstance.request.mockResolvedValue({ data: largeIssueSet });

      const githubClient = new GitHubClient("test-token");
      const relevanceFilter = new RelevanceFilter();

      // Measure memory usage (basic check)
      const memBefore = process.memoryUsage().heapUsed;

      const issues = await githubClient.getRepositoryIssues(
        "perf-owner/perf-repo"
      );
      const filterResult = relevanceFilter.filterIssuesWithFallback(issues, {
        productArea: "performance",
        minRelevanceScore: 0.1, // Lower threshold for testing
        maxResults: 100,
      });
      const filteredIssues = filterResult.issues;

      const memAfter = process.memoryUsage().heapUsed;
      const memDiff = memAfter - memBefore;

      // Verify results
      expect(issues.length).toBe(1000);
      expect(filteredIssues.length).toBeLessThanOrEqual(100);

      // Memory usage should be reasonable (less than 50MB for this test)
      expect(memDiff).toBeLessThan(50 * 1024 * 1024);
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

  describe("Product Area Filtering Scenarios", () => {
    const createTestIssues = (): GitHubIssue[] => [
      {
        id: 1,
        number: 1,
        title: "Authentication system fails with OAuth",
        description: "The OAuth authentication flow is broken for Google login",
        labels: ["bug", "authentication", "oauth"],
        state: "open" as const,
        createdAt: new Date("2023-01-01T00:00:00Z"),
        updatedAt: new Date("2023-01-02T00:00:00Z"),
        author: "user1",
        url: "https://github.com/test/repo/issues/1",
        comments: [],
        relevanceScore: 0,
        summary: "",
        workarounds: [],
      },
      {
        id: 2,
        number: 2,
        title: "Database performance degradation",
        description:
          "Query performance has degraded significantly in the user management system",
        labels: ["performance", "database"],
        state: "open" as const,
        createdAt: new Date("2023-01-03T00:00:00Z"),
        updatedAt: new Date("2023-01-04T00:00:00Z"),
        author: "user2",
        url: "https://github.com/test/repo/issues/2",
        comments: [],
        relevanceScore: 0,
        summary: "",
        workarounds: [],
      },
      {
        id: 3,
        number: 3,
        title: "UI component styling issues",
        description:
          "Button components are not rendering correctly on mobile devices",
        labels: ["ui", "mobile", "styling"],
        state: "open" as const,
        createdAt: new Date("2023-01-05T00:00:00Z"),
        updatedAt: new Date("2023-01-06T00:00:00Z"),
        author: "user3",
        url: "https://github.com/test/repo/issues/3",
        comments: [],
        relevanceScore: 0,
        summary: "",
        workarounds: [],
      },
      {
        id: 4,
        number: 4,
        title: "API rate limiting not working",
        description:
          "The API rate limiting middleware is not properly throttling requests",
        labels: ["api", "rate-limiting", "middleware"],
        state: "open" as const,
        createdAt: new Date("2023-01-07T00:00:00Z"),
        updatedAt: new Date("2023-01-08T00:00:00Z"),
        author: "user4",
        url: "https://github.com/test/repo/issues/4",
        comments: [],
        relevanceScore: 0,
        summary: "",
        workarounds: [],
      },
    ];

    it("should filter by single keyword product area", async () => {
      const relevanceFilter = new RelevanceFilter();
      const testIssues = createTestIssues();

      // Filter by "authentication"
      const authResult = relevanceFilter.filterIssuesWithFallback(testIssues, {
        productArea: "authentication",
        minRelevanceScore: 0.01, // Very low threshold for testing
        maxResults: 50,
      });

      expect(authResult.issues.length).toBeGreaterThan(0);
      // Find the authentication issue (should be first due to relevance sorting)
      const authIssue = authResult.issues.find((issue) =>
        issue.title.toLowerCase().includes("authentication")
      );
      expect(authIssue).toBeDefined();
      expect(authIssue!.relevanceScore).toBeGreaterThan(0);
    });

    it("should filter by multiple keyword product area", async () => {
      const relevanceFilter = new RelevanceFilter();
      const testIssues = createTestIssues();

      // Filter by "performance database"
      const perfResult = relevanceFilter.filterIssuesWithFallback(testIssues, {
        productArea: "performance database",
        minRelevanceScore: 0.01,
        maxResults: 50,
      });

      expect(perfResult.issues.length).toBeGreaterThan(0);
      // Find the performance issue (should be first due to relevance sorting)
      const perfIssue = perfResult.issues.find((issue) =>
        issue.title.toLowerCase().includes("performance")
      );
      expect(perfIssue).toBeDefined();
      expect(perfIssue!.relevanceScore).toBeGreaterThan(0);
    });

    it("should filter by label-based product area", async () => {
      const relevanceFilter = new RelevanceFilter();
      const testIssues = createTestIssues();

      // Filter by "ui mobile"
      const uiResult = relevanceFilter.filterIssuesWithFallback(testIssues, {
        productArea: "ui mobile",
        minRelevanceScore: 0.01,
        maxResults: 50,
      });

      expect(uiResult.issues.length).toBeGreaterThan(0);
      // Find the UI issue (should be first due to relevance sorting)
      const uiIssue = uiResult.issues.find((issue) =>
        issue.title.toLowerCase().includes("ui")
      );
      expect(uiIssue).toBeDefined();
      expect(uiIssue!.relevanceScore).toBeGreaterThan(0);
    });

    it("should handle fuzzy matching for product areas", async () => {
      const relevanceFilter = new RelevanceFilter();
      const testIssues = createTestIssues();

      // Filter by "auth" (should match "authentication")
      const authResult = relevanceFilter.filterIssuesWithFallback(testIssues, {
        productArea: "auth",
        minRelevanceScore: 0.01,
        maxResults: 50,
      });

      expect(authResult.issues.length).toBeGreaterThan(0);
      // Find the authentication issue (should be first due to relevance sorting)
      const authIssue = authResult.issues.find((issue) =>
        issue.title.toLowerCase().includes("authentication")
      );
      expect(authIssue).toBeDefined();
    });

    it("should handle broad product area searches", async () => {
      const relevanceFilter = new RelevanceFilter();
      const testIssues = createTestIssues();

      // Filter by "system" (should match multiple issues)
      const systemResult = relevanceFilter.filterIssuesWithFallback(
        testIssues,
        {
          productArea: "system",
          minRelevanceScore: 0.01,
          maxResults: 50,
        }
      );

      expect(systemResult.issues.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle narrow product area searches", async () => {
      const relevanceFilter = new RelevanceFilter();
      const testIssues = createTestIssues();

      // Filter by very specific term
      const specificResult = relevanceFilter.filterIssuesWithFallback(
        testIssues,
        {
          productArea: "oauth google",
          minRelevanceScore: 0.01,
          maxResults: 50,
        }
      );

      expect(specificResult.issues.length).toBeGreaterThan(0);
      // Find the OAuth issue (should be first due to relevance sorting)
      const oauthIssue = specificResult.issues.find(
        (issue) =>
          issue.title.toLowerCase().includes("oauth") ||
          issue.description.toLowerCase().includes("oauth")
      );
      expect(oauthIssue).toBeDefined();
    });

    it("should respect minimum relevance score thresholds", async () => {
      const relevanceFilter = new RelevanceFilter();
      const testIssues = createTestIssues();

      // High threshold should return fewer results
      const highThresholdResult = relevanceFilter.filterIssuesWithFallback(
        testIssues,
        {
          productArea: "system",
          minRelevanceScore: 50,
          maxResults: 50,
        }
      );

      // Low threshold should return more results
      const lowThresholdResult = relevanceFilter.filterIssuesWithFallback(
        testIssues,
        {
          productArea: "system",
          minRelevanceScore: 0.01,
          maxResults: 50,
        }
      );

      expect(lowThresholdResult.issues.length).toBeGreaterThanOrEqual(
        highThresholdResult.issues.length
      );
    });

    it("should respect maximum results limits", async () => {
      const relevanceFilter = new RelevanceFilter();
      const testIssues = createTestIssues();

      // Test with limit of 2
      const limitedResult = relevanceFilter.filterIssuesWithFallback(
        testIssues,
        {
          productArea: "system",
          minRelevanceScore: 0.01,
          maxResults: 2,
        }
      );

      expect(limitedResult.issues.length).toBeLessThanOrEqual(2);
    });

    it("should handle empty product area gracefully", async () => {
      const relevanceFilter = new RelevanceFilter();
      const testIssues = createTestIssues();

      // Empty product area should return no results
      const emptyResult = relevanceFilter.filterIssuesWithFallback(testIssues, {
        productArea: "",
        minRelevanceScore: 10,
        maxResults: 50,
      });

      expect(emptyResult.issues.length).toBe(0);
      expect(emptyResult.hasResults).toBe(false);
    });

    it("should handle non-matching product areas", async () => {
      const relevanceFilter = new RelevanceFilter();
      const testIssues = createTestIssues();

      // Non-matching product area
      const noResult = relevanceFilter.filterIssuesWithFallback(testIssues, {
        productArea: "blockchain cryptocurrency",
        minRelevanceScore: 10,
        maxResults: 50,
      });

      expect(noResult.issues.length).toBe(0);
      expect(noResult.hasResults).toBe(false);
    });
  });

  describe("Configuration Integration Tests", () => {
    it("should load configuration from environment variables", async () => {
      // Set environment variables
      process.env.GITHUB_TOKEN = "env-token";
      process.env.GITHUB_REPOSITORY = "env-owner/env-repo";
      process.env.PRODUCT_AREA = "env-product-area";
      process.env.MAX_ISSUES = "75";
      process.env.MIN_RELEVANCE_SCORE = "25";
      process.env.OUTPUT_PATH = "./env-reports";

      const configManager = new ConfigManager();
      await configManager.loadConfig();

      const config = configManager.getConfig();

      expect(configManager.getGitHubToken()).toBe("env-token");
      expect(config.repository).toBe("env-owner/env-repo");
      expect(config.productArea).toBe("env-product-area");
      expect(config.maxIssues).toBe(75);
      expect(config.minRelevanceScore).toBe(25);
      expect(config.outputPath).toBe("./env-reports");
    });

    it("should handle missing configuration gracefully", async () => {
      // Save current env and clear all config-related env vars
      const savedEnv = { ...process.env };
      delete process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_REPOSITORY;
      delete process.env.PRODUCT_AREA;
      delete process.env.MAX_ISSUES;
      delete process.env.MIN_RELEVANCE_SCORE;
      delete process.env.OUTPUT_PATH;

      try {
        const configManager = new ConfigManager();
        await configManager.loadConfig();

        expect(configManager.isConfigComplete()).toBe(false);

        const missingFields = configManager.getMissingFields();
        expect(missingFields).toContain("GitHub Token");
        expect(missingFields).toContain("Repository");
        expect(missingFields).toContain("Product Area");
        expect(missingFields.length).toBe(3);
      } finally {
        // Restore environment
        process.env = savedEnv;
      }
    });
  });
});
