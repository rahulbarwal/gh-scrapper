import { GitHubIssueScraper } from "../scraper";
import { GitHubClient } from "../github-client";
import { JANClient } from "../jan-client";
import { PromptManager } from "../prompt-manager";
import { RawGitHubIssue, RawComment, LLMAnalysisResponse } from "../../models";

// Mock dependencies
jest.mock("../github-client");
jest.mock("../jan-client");

describe("LLM Integration Tests", () => {
  // Mock data
  const mockToken = "mock-token";
  const mockConfig = {
    githubToken: mockToken,
    repository: "owner/repo",
    productArea: "authentication",
    maxIssues: 10,
    minRelevanceScore: 50,
    outputPath: "./reports",
    janEndpoint: "http://localhost:1337",
    janModel: "llama2",
  };

  const mockRawIssues: RawGitHubIssue[] = [
    {
      id: 1,
      number: 101,
      title: "Authentication fails with special characters",
      body: "When using special characters in password, login fails",
      labels: [{ name: "bug" }],
      state: "open",
      created_at: "2023-01-01T00:00:00Z",
      updated_at: "2023-01-02T00:00:00Z",
      user: { login: "user1" },
      html_url: "https://github.com/owner/repo/issues/101",
      comments_url:
        "https://api.github.com/repos/owner/repo/issues/101/comments",
      comments: 2,
    },
    {
      id: 2,
      number: 102,
      title: "Feature request: Remember me option",
      body: "Please add a remember me option to the login form",
      labels: [{ name: "enhancement" }],
      state: "open",
      created_at: "2023-01-03T00:00:00Z",
      updated_at: "2023-01-04T00:00:00Z",
      user: { login: "user2" },
      html_url: "https://github.com/owner/repo/issues/102",
      comments_url:
        "https://api.github.com/repos/owner/repo/issues/102/comments",
      comments: 1,
    },
  ];

  const mockComments: RawComment[] = [
    {
      id: 201,
      user: { login: "user3" },
      body: "I found a workaround: escape the special characters before submitting",
      created_at: "2023-01-02T01:00:00Z",
      author_association: "USER",
    },
    {
      id: 202,
      user: { login: "maintainer" },
      body: "We'll fix this in the next release. For now, avoid using & and < characters.",
      created_at: "2023-01-02T02:00:00Z",
      author_association: "MEMBER",
    },
  ];

  const mockLLMResponse: LLMAnalysisResponse = {
    relevantIssues: [
      {
        id: 1,
        title: "Authentication fails with special characters",
        relevanceScore: 90,
        category: "Authentication Bug",
        priority: "high",
        summary:
          "Users cannot log in when using special characters in passwords",
        workarounds: [
          {
            description: "Escape special characters before submitting",
            author: "user3",
            authorType: "user",
            effectiveness: "partial",
            confidence: 80,
          },
          {
            description: "Avoid using & and < characters",
            author: "maintainer",
            authorType: "maintainer",
            effectiveness: "confirmed",
            confidence: 95,
          },
        ],
        tags: ["authentication", "bug", "special-characters"],
        sentiment: "negative",
      },
      {
        id: 2,
        title: "Feature request: Remember me option",
        relevanceScore: 75,
        category: "Authentication Enhancement",
        priority: "medium",
        summary: "Request to add persistent login functionality",
        workarounds: [],
        tags: ["authentication", "enhancement", "user-experience"],
        sentiment: "neutral",
      },
    ],
    summary: {
      totalAnalyzed: 2,
      relevantFound: 2,
      topCategories: ["Authentication Bug", "Authentication Enhancement"],
      analysisModel: "llama2",
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup GitHub client mock
    (GitHubClient.prototype.getRepositoryIssues as jest.Mock).mockResolvedValue(
      []
    );
    (GitHubClient.prototype.getIssueComments as jest.Mock).mockImplementation(
      (repo, issueNumber) => {
        if (issueNumber === 101) {
          return Promise.resolve(
            mockComments.map((c) => ({
              id: c.id,
              author: c.user.login,
              body: c.body,
              createdAt: new Date(c.created_at),
              authorType:
                c.author_association === "MEMBER"
                  ? "maintainer"
                  : c.author_association === "CONTRIBUTOR"
                  ? "contributor"
                  : "user",
            }))
          );
        }
        return Promise.resolve([]);
      }
    );

    // Setup JAN client mock
    (JANClient.prototype.validateConnection as jest.Mock).mockResolvedValue(
      true
    );
    (JANClient.prototype.validateModel as jest.Mock).mockResolvedValue(true);
    (JANClient.prototype.analyzeIssues as jest.Mock).mockResolvedValue(
      mockLLMResponse
    );
  });

  test("should integrate LLM analysis into core workflow", async () => {
    // Override getRepositoryIssues to return our mock issues
    (GitHubClient.prototype.getRepositoryIssues as jest.Mock).mockResolvedValue(
      mockRawIssues.map((issue) => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        description: issue.body,
        labels: issue.labels.map((l) => l.name),
        state: issue.state,
        createdAt: new Date(issue.created_at),
        updatedAt: new Date(issue.updated_at),
        author: issue.user.login,
        url: issue.html_url,
        comments: [],
        relevanceScore: 0,
        category: "",
        priority: "medium",
        summary: "",
        workarounds: [],
        tags: [],
        sentiment: "neutral",
      }))
    );

    // Create scraper instance
    const scraper = new GitHubIssueScraper(mockToken, {
      endpoint: mockConfig.janEndpoint,
      model: mockConfig.janModel,
    });

    // Mock progress callback
    const progressCallback = jest.fn();

    // Execute scraping
    const result = await scraper.scrapeRepository(mockConfig, progressCallback);

    // Verify JAN client was called with correct parameters
    expect(JANClient.prototype.validateConnection).toHaveBeenCalled();
    expect(JANClient.prototype.analyzeIssues).toHaveBeenCalled();

    // Verify results contain LLM-analyzed issues
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0].relevanceScore).toBeGreaterThan(0);
    expect(result.issues[0].workarounds.length).toBeGreaterThan(0);

    // Verify progress callback was called
    expect(progressCallback).toHaveBeenCalled();
  });

  test("should handle LLM analysis errors gracefully", async () => {
    // Setup GitHub client mock
    (GitHubClient.prototype.getRepositoryIssues as jest.Mock).mockResolvedValue(
      mockRawIssues.map((issue) => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        description: issue.body,
        labels: issue.labels.map((l) => l.name),
        state: issue.state,
        createdAt: new Date(issue.created_at),
        updatedAt: new Date(issue.updated_at),
        author: issue.user.login,
        url: issue.html_url,
        comments: [],
        relevanceScore: 0,
        category: "",
        priority: "medium",
        summary: "",
        workarounds: [],
        tags: [],
        sentiment: "neutral",
      }))
    );

    // Make JAN client throw an error on first call, then succeed on retry
    let callCount = 0;
    (JANClient.prototype.analyzeIssues as jest.Mock).mockImplementation(() => {
      if (callCount === 0) {
        callCount++;
        throw new Error("LLM context length exceeded");
      }
      return Promise.resolve(mockLLMResponse);
    });

    // Create scraper instance
    const scraper = new GitHubIssueScraper(mockToken);

    // Execute scraping
    const result = await scraper.scrapeRepository(mockConfig);

    // Verify JAN client was called multiple times (initial + retry)
    expect(JANClient.prototype.analyzeIssues).toHaveBeenCalledTimes(2);

    // Verify results still contain LLM-analyzed issues from successful retry
    expect(result.issues.length).toBeGreaterThan(0);
  });

  test("should process issues in batches for large repositories", async () => {
    // Create a larger set of mock issues
    const largeIssueSet = Array(20)
      .fill(null)
      .map((_, i) => ({
        ...mockRawIssues[0],
        id: i + 1,
        number: i + 101,
      }));

    // Setup GitHub client mock for large issue set
    (GitHubClient.prototype.getRepositoryIssues as jest.Mock).mockResolvedValue(
      largeIssueSet.map((issue) => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        description: issue.body,
        labels: issue.labels.map((l) => l.name),
        state: issue.state,
        createdAt: new Date(issue.created_at),
        updatedAt: new Date(issue.updated_at),
        author: issue.user.login,
        url: issue.html_url,
        comments: [],
        relevanceScore: 0,
        category: "",
        priority: "medium",
        summary: "",
        workarounds: [],
        tags: [],
        sentiment: "neutral",
      }))
    );

    // Create scraper instance with large maxIssues
    const largeConfig = { ...mockConfig, maxIssues: 20 };
    const scraper = new GitHubIssueScraper(mockToken);

    // Execute scraping
    await scraper.scrapeRepository(largeConfig);

    // Verify JAN client was called with batched issues
    const analyzeIssuesCalls = (JANClient.prototype.analyzeIssues as jest.Mock)
      .mock.calls;
    expect(analyzeIssuesCalls.length).toBeGreaterThan(0);

    // The batch size parameter should be passed
    const batchSizeParam = analyzeIssuesCalls[0][4];
    expect(typeof batchSizeParam).toBe("number");
  });
});
