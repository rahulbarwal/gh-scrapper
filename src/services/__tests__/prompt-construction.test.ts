import { PromptManager } from "../prompt-manager";
import { RawGitHubIssue, RawComment, JANMessage } from "../../models";

describe("Prompt Construction and Formatting", () => {
  let promptManager: PromptManager;

  // Sample test data
  const mockIssue: RawGitHubIssue = {
    id: 12345,
    number: 42,
    title: "App crashes when uploading large images",
    body: "When I try to upload images larger than 10MB, the app crashes with an out of memory error.",
    labels: [{ name: "bug" }, { name: "high-priority" }],
    state: "open",
    created_at: "2023-01-01T00:00:00Z",
    updated_at: "2023-01-02T00:00:00Z",
    user: { login: "testuser" },
    html_url: "https://github.com/test/repo/issues/42",
    comments_url: "https://api.github.com/repos/test/repo/issues/42/comments",
    comments: 2,
  };

  const mockComments: RawComment[] = [
    {
      id: 1001,
      user: { login: "maintainer" },
      body: "This is a known issue. As a workaround, try resizing your images before uploading.",
      created_at: "2023-01-01T12:00:00Z",
      author_association: "MEMBER",
    },
    {
      id: 1002,
      user: { login: "user123" },
      body: "I found that using the desktop app works fine with large images.",
      created_at: "2023-01-02T12:00:00Z",
      author_association: "NONE",
    },
  ];

  beforeEach(() => {
    promptManager = new PromptManager();
  });

  describe("Prompt Structure", () => {
    test("buildAnalysisPrompt should include system role, user role, and proper context", () => {
      const commentsMap = new Map<number, RawComment[]>();
      commentsMap.set(mockIssue.id, mockComments);

      const productArea = "image processing";
      const prompt = promptManager.buildAnalysisPrompt(
        [mockIssue],
        commentsMap,
        productArea
      );

      // Check structure
      expect(prompt).toHaveLength(2);
      expect(prompt[0].role).toBe("system");
      expect(prompt[1].role).toBe("user");

      // Check content
      expect(prompt[0].content).toContain("expert GitHub issue analyst");
      expect(prompt[1].content).toContain(productArea);
      expect(prompt[1].content).toContain(mockIssue.title);
      expect(prompt[1].content).toContain("relevance score");
      expect(prompt[1].content).toContain("workarounds");

      // Check schema inclusion
      expect(prompt[1].content).toContain("JSON object");
      expect(prompt[1].content).toContain("schema");
      expect(prompt[1].content).toContain("relevantIssues");
    });

    test("buildScoringPrompt should create a focused prompt for relevance scoring", () => {
      const productArea = "image processing";
      const prompt = promptManager.buildScoringPrompt(
        mockIssue,
        mockComments,
        productArea
      );

      expect(prompt).toHaveLength(2);
      expect(prompt[0].role).toBe("system");
      expect(prompt[1].role).toBe("user");

      expect(prompt[1].content).toContain("score the following GitHub issue");
      expect(prompt[1].content).toContain(productArea);
      expect(prompt[1].content).toContain("scale of 0-100");
      expect(prompt[1].content).toContain("relevanceScore");
      expect(prompt[1].content).toContain(mockIssue.title);
    });

    test("buildWorkaroundExtractionPrompt should focus on identifying solutions", () => {
      const prompt = promptManager.buildWorkaroundExtractionPrompt(
        mockIssue,
        mockComments
      );

      expect(prompt).toHaveLength(2);
      expect(prompt[0].role).toBe("system");
      expect(prompt[1].role).toBe("user");

      expect(prompt[0].content).toContain("expert at identifying workarounds");
      expect(prompt[1].content).toContain("extract any workarounds");
      expect(prompt[1].content).toContain("workarounds");
      expect(prompt[1].content).toContain("author");
      expect(prompt[1].content).toContain("effectiveness");
      expect(prompt[1].content).toContain(mockIssue.title);
    });

    test("buildSummaryPrompt should focus on concise issue summarization", () => {
      const prompt = promptManager.buildSummaryPrompt(mockIssue, mockComments);

      expect(prompt).toHaveLength(2);
      expect(prompt[0].role).toBe("system");
      expect(prompt[1].role).toBe("user");

      expect(prompt[0].content).toContain("expert at summarizing");
      expect(prompt[1].content).toContain("create a concise summary");
      expect(prompt[1].content).toContain("summary");
      expect(prompt[1].content).toContain(mockIssue.title);
    });
  });

  describe("Batch Processing", () => {
    test("createBatchPrompts should split issues into appropriate batches", () => {
      const issues = [
        mockIssue,
        { ...mockIssue, id: 12346, number: 43 },
        { ...mockIssue, id: 12347, number: 44 },
        { ...mockIssue, id: 12348, number: 45 },
        { ...mockIssue, id: 12349, number: 46 },
      ];

      const commentsMap = new Map<number, RawComment[]>();
      commentsMap.set(mockIssue.id, mockComments);

      // Test with batch size of 2
      const batches = promptManager.createBatchPrompts(
        issues,
        commentsMap,
        "image processing",
        2
      );

      expect(batches).toHaveLength(3); // 5 issues with batch size 2 = 3 batches

      // Check first batch
      expect(batches[0][1].content).toContain("Issue #42");
      expect(batches[0][1].content).toContain("Issue #43");
      expect(batches[0][1].content).not.toContain("Issue #44");

      // Check second batch
      expect(batches[1][1].content).toContain("Issue #44");
      expect(batches[1][1].content).toContain("Issue #45");
      expect(batches[1][1].content).not.toContain("Issue #46");

      // Check third batch
      expect(batches[2][1].content).toContain("Issue #46");
    });

    test("createBatchPrompts should handle single issue batch", () => {
      const commentsMap = new Map<number, RawComment[]>();
      commentsMap.set(mockIssue.id, mockComments);

      const batches = promptManager.createBatchPrompts(
        [mockIssue],
        commentsMap,
        "image processing",
        5
      );

      expect(batches).toHaveLength(1);
      expect(batches[0][1].content).toContain(mockIssue.title);
    });

    test("createBatchPrompts should handle empty issues array", () => {
      const commentsMap = new Map<number, RawComment[]>();

      const batches = promptManager.createBatchPrompts(
        [],
        commentsMap,
        "image processing",
        5
      );

      expect(batches).toHaveLength(0);
    });
  });

  describe("Issue Formatting", () => {
    test("formatIssueData should properly format issue with comments", () => {
      const formatted = promptManager.formatIssueData(mockIssue, mockComments);

      // Check issue metadata
      expect(formatted).toContain(`ISSUE #${mockIssue.number}`);
      expect(formatted).toContain(`TITLE: ${mockIssue.title}`);
      expect(formatted).toContain(`AUTHOR: ${mockIssue.user.login}`);
      expect(formatted).toContain(`STATE: ${mockIssue.state}`);
      expect(formatted).toContain(mockIssue.body);

      // Check comments
      expect(formatted).toContain(`COMMENTS (${mockComments.length}):`);
      expect(formatted).toContain("COMMENT BY: maintainer");
      expect(formatted).toContain("COMMENT BY: user123");
      expect(formatted).toContain(mockComments[0].body);
      expect(formatted).toContain(mockComments[1].body);
    });

    test("formatIssueData should handle issues with no body", () => {
      const noBodyIssue = { ...mockIssue, body: "" };
      const formatted = promptManager.formatIssueData(
        noBodyIssue,
        mockComments
      );

      expect(formatted).toContain("No description provided");
    });

    test("formatIssueData should handle issues with no comments", () => {
      const formatted = promptManager.formatIssueData(mockIssue, []);

      expect(formatted).toContain("NO COMMENTS");
      expect(formatted).not.toContain("COMMENTS (");
    });
  });

  describe("Response Schema", () => {
    test("createResponseSchema should return a valid JSON schema", () => {
      const schema = promptManager.createResponseSchema();

      // Verify it's valid JSON
      expect(() => JSON.parse(schema)).not.toThrow();

      const parsedSchema = JSON.parse(schema);

      // Check required properties
      expect(parsedSchema.required).toContain("relevantIssues");
      expect(parsedSchema.required).toContain("summary");

      // Check issue properties
      const issueProperties =
        parsedSchema.properties.relevantIssues.items.properties;
      expect(issueProperties.id).toBeDefined();
      expect(issueProperties.title).toBeDefined();
      expect(issueProperties.relevanceScore).toBeDefined();
      expect(issueProperties.category).toBeDefined();
      expect(issueProperties.priority).toBeDefined();
      expect(issueProperties.summary).toBeDefined();
      expect(issueProperties.workarounds).toBeDefined();
      expect(issueProperties.tags).toBeDefined();
      expect(issueProperties.sentiment).toBeDefined();

      // Check workaround properties
      const workaroundProperties = issueProperties.workarounds.items.properties;
      expect(workaroundProperties.description).toBeDefined();
      expect(workaroundProperties.author).toBeDefined();
      expect(workaroundProperties.authorType).toBeDefined();
      expect(workaroundProperties.effectiveness).toBeDefined();
      expect(workaroundProperties.confidence).toBeDefined();
    });
  });

  describe("Few-Shot Examples", () => {
    test("createFewShotExample should return a valid example response", () => {
      const example = promptManager.createFewShotExample();

      expect(example.role).toBe("assistant");

      // Verify it's valid JSON
      expect(() => JSON.parse(example.content)).not.toThrow();

      const parsed = JSON.parse(example.content);

      // Check structure
      expect(parsed.relevantIssues).toBeDefined();
      expect(Array.isArray(parsed.relevantIssues)).toBe(true);
      expect(parsed.relevantIssues.length).toBeGreaterThan(0);

      // Check example issue
      const exampleIssue = parsed.relevantIssues[0];
      expect(exampleIssue.id).toBeDefined();
      expect(exampleIssue.title).toBeDefined();
      expect(exampleIssue.relevanceScore).toBeDefined();
      expect(exampleIssue.workarounds).toBeDefined();
      expect(Array.isArray(exampleIssue.workarounds)).toBe(true);

      // Check summary
      expect(parsed.summary).toBeDefined();
      expect(parsed.summary.totalAnalyzed).toBeDefined();
      expect(parsed.summary.relevantFound).toBeDefined();
      expect(parsed.summary.topCategories).toBeDefined();
      expect(parsed.summary.analysisModel).toBeDefined();
    });
  });
});
