import axios from "axios";
import { GitHubClient } from "../github-client";
import { ScraperError } from "../error-handler";

// Mock axios
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("GitHubClient Integration Tests", () => {
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

  describe("End-to-end flow", () => {
    it("should fetch issues and comments in a complete workflow", async () => {
      // Mock repository issues response
      const mockIssues = [
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
          comments: 2,
        },
        {
          id: 2,
          number: 2,
          title: "Test Issue 2",
          body: "Test description 2",
          labels: [{ name: "enhancement", color: "green" }],
          state: "open" as const,
          created_at: "2023-01-03T00:00:00Z",
          updated_at: "2023-01-04T00:00:00Z",
          user: { login: "anotheruser" },
          html_url: "https://github.com/owner/repo/issues/2",
          comments: 1,
        },
      ];

      // Mock comments for issue 1
      const mockComments1 = [
        {
          id: 101,
          user: { login: "commenter1", type: "User" },
          body: "This is a comment with a workaround: ```code```",
          created_at: "2023-01-01T12:00:00Z",
          author_association: "CONTRIBUTOR",
        },
        {
          id: 102,
          user: { login: "maintainer", type: "User" },
          body: "Official fix: Step 1, Step 2",
          created_at: "2023-01-02T12:00:00Z",
          author_association: "OWNER",
        },
      ];

      // Mock comments for issue 2
      const mockComments2 = [
        {
          id: 201,
          user: { login: "user1", type: "User" },
          body: "I have the same problem",
          created_at: "2023-01-03T12:00:00Z",
          author_association: "NONE",
        },
      ];

      // Setup mock responses
      mockAxiosInstance.request
        .mockResolvedValueOnce({ data: mockIssues }) // First call for issues
        .mockResolvedValueOnce({ data: mockComments1 }) // Second call for issue 1 comments
        .mockResolvedValueOnce({ data: mockComments2 }); // Third call for issue 2 comments

      // Execute the workflow
      const issues = await client.getRepositoryIssues("owner/repo");

      // Verify issues were fetched correctly
      expect(issues).toHaveLength(2);
      expect(issues[0].id).toBe(1);
      expect(issues[1].id).toBe(2);

      // Fetch comments for each issue
      const comments1 = await client.getIssueComments("owner/repo", 1);
      const comments2 = await client.getIssueComments("owner/repo", 2);

      // Verify comments were fetched correctly
      expect(comments1).toHaveLength(2);
      expect(comments1[0].id).toBe(101);
      expect(comments1[1].id).toBe(102);

      expect(comments2).toHaveLength(1);
      expect(comments2[0].id).toBe(201);

      // Verify API calls were made correctly
      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(3);
      expect(mockAxiosInstance.request).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          url: "/repos/owner/repo/issues",
        })
      );
      expect(mockAxiosInstance.request).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          url: "/repos/owner/repo/issues/1/comments",
        })
      );
      expect(mockAxiosInstance.request).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          url: "/repos/owner/repo/issues/2/comments",
        })
      );
    });
  });

  describe("API parameters", () => {
    it("should handle rate limiting parameters", async () => {
      // Setup mock response
      mockAxiosInstance.request.mockResolvedValue({ data: [] });

      await client.getRepositoryIssues("owner/repo");

      // Verify the API call was made with correct parameters
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "/repos/owner/repo/issues",
          method: "GET",
          params: expect.objectContaining({
            state: "open",
            sort: "updated",
            direction: "desc",
          }),
        })
      );
    });

    it("should handle network error parameters", async () => {
      // Setup mock response
      mockAxiosInstance.request.mockResolvedValue({ data: [] });

      await client.getRepositoryIssues("owner/repo");

      // Verify the API call was made with correct parameters
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "/repos/owner/repo/issues",
          method: "GET",
          timeout: 30000, // Verify timeout is set
        })
      );
    });

    it("should handle pagination parameters", async () => {
      // Setup mock response
      mockAxiosInstance.request.mockResolvedValue({ data: [] });

      await client.getRepositoryIssues("owner/repo");

      // Verify pagination parameters are included
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            page: 1,
            per_page: 100,
          }),
        })
      );
    });
  });

  describe("Various product area filtering scenarios", () => {
    it("should filter issues by product area labels", async () => {
      // Setup mock response
      mockAxiosInstance.request.mockResolvedValue({ data: [] });

      // Filter by authentication label
      await client.getRepositoryIssues("owner/repo", {
        labels: "authentication",
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            labels: "authentication",
          }),
        })
      );
    });

    it("should filter issues by state", async () => {
      // Setup mock response
      mockAxiosInstance.request.mockResolvedValue({ data: [] });

      // Filter by closed state
      await client.getRepositoryIssues("owner/repo", {
        state: "closed",
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            state: "closed",
          }),
        })
      );
    });

    it("should filter issues by date range", async () => {
      // Setup mock response
      mockAxiosInstance.request.mockResolvedValue({ data: [] });

      // Filter by date range
      const since = "2022-12-01T00:00:00Z";
      await client.getRepositoryIssues("owner/repo", {
        since,
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            since,
          }),
        })
      );
    });
  });
});
