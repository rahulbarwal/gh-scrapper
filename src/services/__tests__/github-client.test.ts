import axios from "axios";
import { GitHubClient, GitHubApiError } from "../github-client";
import { GitHubIssue, Comment } from "../../models";

// Mock axios
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("GitHubClient", () => {
  let client: GitHubClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock axios instance
    mockAxiosInstance = {
      request: jest.fn(),
      interceptors: {
        response: {
          use: jest.fn(),
        },
      },
    };

    // Mock axios.create to return our mock instance
    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    client = new GitHubClient("test-token");
  });

  describe("constructor", () => {
    it("should create axios instance with correct configuration", () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: "https://api.github.com",
        headers: {
          Accept: "application/vnd.github.v3+json",
          Authorization: "Bearer test-token",
          "User-Agent": "github-issue-scraper/1.0.0",
        },
        timeout: 30000,
      });
    });

    it("should set up response interceptor for rate limiting", () => {
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe("getRepositoryIssues", () => {
    const mockApiIssues = [
      {
        id: 1,
        number: 1,
        title: "Test Issue 1",
        body: "Test description 1",
        labels: [{ name: "bug", color: "red" }],
        state: "open" as const,
        created_at: "2023-01-01T00:00:00Z",
        updated_at: "2023-01-02T00:00:00Z",
        user: { login: "testuser" },
        html_url: "https://github.com/owner/repo/issues/1",
        comments: 5,
      },
      {
        id: 2,
        number: 2,
        title: "Test Issue 2",
        body: null,
        labels: [{ name: "enhancement", color: "green" }],
        state: "closed" as const,
        created_at: "2023-01-03T00:00:00Z",
        updated_at: "2023-01-04T00:00:00Z",
        user: { login: "anotheruser" },
        html_url: "https://github.com/owner/repo/issues/2",
        comments: 0,
      },
    ];

    it("should fetch repository issues successfully", async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: mockApiIssues,
      });

      const issues = await client.getRepositoryIssues("owner/repo");

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        url: "/repos/owner/repo/issues",
        method: "GET",
        params: {
          state: "open",
          sort: "updated",
          direction: "desc",
          page: 1,
          per_page: 100,
        },
      });

      expect(issues).toHaveLength(2);
      expect(issues[0]).toMatchObject({
        id: 1,
        title: "Test Issue 1",
        description: "Test description 1",
        labels: ["bug"],
        state: "open",
        author: "testuser",
        url: "https://github.com/owner/repo/issues/1",
      });
      expect(issues[1]).toMatchObject({
        id: 2,
        title: "Test Issue 2",
        description: "",
        labels: ["enhancement"],
        state: "closed",
        author: "anotheruser",
      });
    });

    it("should handle pagination correctly", async () => {
      // First page
      mockAxiosInstance.request
        .mockResolvedValueOnce({
          data: new Array(100).fill(mockApiIssues[0]),
        })
        .mockResolvedValueOnce({
          data: [mockApiIssues[1]],
        });

      const issues = await client.getRepositoryIssues(
        "owner/repo",
        {},
        { maxPages: 2 }
      );

      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(2);
      expect(issues).toHaveLength(101);
    });

    it("should apply filters correctly", async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: mockApiIssues,
      });

      await client.getRepositoryIssues("owner/repo", {
        state: "closed",
        labels: "bug,enhancement",
        sort: "created",
        direction: "asc",
        since: "2023-01-01T00:00:00Z",
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        url: "/repos/owner/repo/issues",
        method: "GET",
        params: {
          state: "closed",
          sort: "created",
          direction: "asc",
          page: 1,
          per_page: 100,
          labels: "bug,enhancement",
          since: "2023-01-01T00:00:00Z",
        },
      });
    });

    it("should throw error for invalid repository format", async () => {
      await expect(client.getRepositoryIssues("invalid-repo")).rejects.toThrow(
        GitHubApiError
      );
    });

    it("should handle API errors", async () => {
      mockAxiosInstance.request.mockRejectedValue({
        response: {
          status: 404,
          statusText: "Not Found",
          data: { message: "Not Found" },
        },
      });

      await expect(client.getRepositoryIssues("owner/repo")).rejects.toThrow(
        GitHubApiError
      );
    });
  });

  describe("getIssueComments", () => {
    const mockApiComments = [
      {
        id: 1,
        user: { login: "commenter1", type: "User" },
        body: "This is a comment",
        created_at: "2023-01-01T00:00:00Z",
        author_association: "CONTRIBUTOR",
      },
      {
        id: 2,
        user: { login: "maintainer", type: "User" },
        body: "This is a maintainer response",
        created_at: "2023-01-02T00:00:00Z",
        author_association: "OWNER",
      },
    ];

    it("should fetch issue comments successfully", async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: mockApiComments,
      });

      const comments = await client.getIssueComments("owner/repo", 1);

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        url: "/repos/owner/repo/issues/1/comments",
        method: "GET",
        params: {
          page: 1,
          per_page: 100,
        },
      });

      expect(comments).toHaveLength(2);
      expect(comments[0]).toMatchObject({
        id: 1,
        author: "commenter1",
        body: "This is a comment",
        authorType: "contributor",
        isWorkaround: false,
      });
      expect(comments[1]).toMatchObject({
        id: 2,
        author: "maintainer",
        body: "This is a maintainer response",
        authorType: "maintainer",
      });
    });

    it("should handle pagination for comments", async () => {
      mockAxiosInstance.request
        .mockResolvedValueOnce({
          data: new Array(100).fill(mockApiComments[0]),
        })
        .mockResolvedValueOnce({
          data: [mockApiComments[1]],
        });

      const comments = await client.getIssueComments("owner/repo", 1);

      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(2);
      expect(comments).toHaveLength(101);
    });

    it("should map author associations correctly", async () => {
      const commentsWithDifferentAssociations = [
        { ...mockApiComments[0], author_association: "OWNER" },
        { ...mockApiComments[0], author_association: "MEMBER" },
        { ...mockApiComments[0], author_association: "COLLABORATOR" },
        { ...mockApiComments[0], author_association: "CONTRIBUTOR" },
        { ...mockApiComments[0], author_association: "NONE" },
      ];

      mockAxiosInstance.request.mockResolvedValue({
        data: commentsWithDifferentAssociations,
      });

      const comments = await client.getIssueComments("owner/repo", 1);

      expect(comments[0].authorType).toBe("maintainer"); // OWNER
      expect(comments[1].authorType).toBe("maintainer"); // MEMBER
      expect(comments[2].authorType).toBe("maintainer"); // COLLABORATOR
      expect(comments[3].authorType).toBe("contributor"); // CONTRIBUTOR
      expect(comments[4].authorType).toBe("user"); // NONE
    });
  });

  describe("getRateLimitInfo", () => {
    it("should fetch rate limit information successfully", async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: {
          rate: {
            limit: 5000,
            remaining: 4999,
            reset: 1640995200, // 2022-01-01 00:00:00 UTC
          },
        },
      });

      const rateLimitInfo = await client.getRateLimitInfo();

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        url: "/rate_limit",
        method: "GET",
      });

      expect(rateLimitInfo).toEqual({
        limit: 5000,
        remaining: 4999,
        reset: new Date(1640995200 * 1000),
      });
    });
  });

  describe("rate limiting and error handling", () => {
    it("should handle rate limiting with exponential backoff", async () => {
      const rateLimitError = {
        response: {
          status: 403,
          headers: {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": Math.floor(
              (Date.now() + 1000) / 1000
            ).toString(),
          },
          data: { message: "API rate limit exceeded" },
        },
      };

      // Mock sleep to avoid actual delays in tests
      const mockSetTimeout = jest
        .spyOn(global, "setTimeout")
        .mockImplementation((callback: any) => {
          callback();
          return {} as any;
        });

      mockAxiosInstance.request
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({ data: [] });

      const issues = await client.getRepositoryIssues("owner/repo");

      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(2);
      expect(issues).toEqual([]);

      // Restore setTimeout
      mockSetTimeout.mockRestore();
    });

    it("should retry on network errors", async () => {
      const networkError = new Error("Network Error");

      // Mock sleep to avoid actual delays in tests
      const mockSetTimeout = jest
        .spyOn(global, "setTimeout")
        .mockImplementation((callback: any) => {
          callback();
          return {} as any;
        });

      mockAxiosInstance.request
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({ data: [] });

      const issues = await client.getRepositoryIssues("owner/repo");

      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(2);
      expect(issues).toEqual([]);

      // Restore setTimeout
      mockSetTimeout.mockRestore();
    });

    it("should throw error after max retries", async () => {
      const networkError = new Error("Network Error");

      // Mock sleep to avoid actual delays in tests
      const mockSetTimeout = jest
        .spyOn(global, "setTimeout")
        .mockImplementation((callback: any) => {
          callback();
          return {} as any;
        });

      mockAxiosInstance.request.mockRejectedValue(networkError);

      await expect(client.getRepositoryIssues("owner/repo")).rejects.toThrow(
        "Network Error"
      );

      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(6); // Initial + 5 retries

      // Restore setTimeout
      mockSetTimeout.mockRestore();
    });

    it("should handle different HTTP error codes appropriately", async () => {
      const testCases = [
        { status: 401, expectedMessage: "Authentication failed" },
        { status: 403, expectedMessage: "Access forbidden" },
        { status: 404, expectedMessage: "Resource not found" },
        { status: 422, expectedMessage: "Invalid request" },
        { status: 500, expectedMessage: "GitHub API error" },
      ];

      for (const testCase of testCases) {
        mockAxiosInstance.request.mockRejectedValueOnce({
          response: {
            status: testCase.status,
            statusText: "Error",
            data: { message: "Test error" },
          },
        });

        await expect(client.getRepositoryIssues("owner/repo")).rejects.toThrow(
          GitHubApiError
        );
      }
    });
  });

  describe("error handling edge cases", () => {
    it("should handle missing response data gracefully", async () => {
      // Mock sleep to avoid actual delays in tests
      const mockSetTimeout = jest
        .spyOn(global, "setTimeout")
        .mockImplementation((callback: any) => {
          callback();
          return {} as any;
        });

      mockAxiosInstance.request.mockRejectedValue({
        response: {
          status: 500,
          statusText: "Internal Server Error",
        },
      });

      await expect(client.getRepositoryIssues("owner/repo")).rejects.toThrow(
        GitHubApiError
      );

      // Restore setTimeout
      mockSetTimeout.mockRestore();
    }, 10000);

    it("should handle null issue body", async () => {
      const mockApiIssue = {
        id: 1,
        number: 1,
        title: "Test Issue",
        body: null,
        labels: [{ name: "bug", color: "red" }],
        state: "open" as const,
        created_at: "2023-01-01T00:00:00Z",
        updated_at: "2023-01-02T00:00:00Z",
        user: { login: "testuser" },
        html_url: "https://github.com/owner/repo/issues/1",
        comments: 0,
      };

      mockAxiosInstance.request.mockResolvedValue({
        data: [mockApiIssue],
      });

      const issues = await client.getRepositoryIssues("owner/repo");

      expect(issues[0].description).toBe("");
    });
  });
});
