import { PromptManager } from "../prompt-manager";
import { RawGitHubIssue, RawComment } from "../../models";

describe("PromptManager", () => {
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

  test("createSystemPrompt should return a system message", () => {
    const systemPrompt = promptManager.createSystemPrompt();

    expect(systemPrompt.role).toBe("system");
    expect(systemPrompt.content).toContain("expert GitHub issue analyst");
    expect(systemPrompt.content).toContain("structured JSON");
  });

  test("createResponseSchema should return a valid JSON schema", () => {
    const schema = promptManager.createResponseSchema();

    expect(() => JSON.parse(schema)).not.toThrow();
    const parsedSchema = JSON.parse(schema);

    expect(parsedSchema.properties.relevantIssues).toBeDefined();
    expect(parsedSchema.properties.summary).toBeDefined();
  });

  test("formatIssueData should format issue data correctly", () => {
    const formattedIssue = promptManager.formatIssueData(
      mockIssue,
      mockComments
    );

    expect(formattedIssue).toContain(`ISSUE #${mockIssue.number}`);
    expect(formattedIssue).toContain(`TITLE: ${mockIssue.title}`);
    expect(formattedIssue).toContain(mockIssue.body);
    expect(formattedIssue).toContain("COMMENTS (2):");
    expect(formattedIssue).toContain("COMMENT BY: maintainer");
    expect(formattedIssue).toContain("COMMENT BY: user123");
  });

  test("formatIssueData should handle issues without comments", () => {
    const formattedIssue = promptManager.formatIssueData(mockIssue, []);

    expect(formattedIssue).toContain(`ISSUE #${mockIssue.number}`);
    expect(formattedIssue).toContain(`TITLE: ${mockIssue.title}`);
    expect(formattedIssue).toContain("NO COMMENTS");
    expect(formattedIssue).not.toContain("COMMENTS (");
  });

  test("buildAnalysisPrompt should create a complete prompt with system and user messages", () => {
    const commentsMap = new Map<number, RawComment[]>();
    commentsMap.set(mockIssue.id, mockComments);

    const prompt = promptManager.buildAnalysisPrompt(
      [mockIssue],
      commentsMap,
      "image processing"
    );

    expect(prompt.length).toBe(2);
    expect(prompt[0].role).toBe("system");
    expect(prompt[1].role).toBe("user");
    expect(prompt[1].content).toContain("image processing");
    expect(prompt[1].content).toContain(mockIssue.title);
    expect(prompt[1].content).toContain("schema");
  });

  test("buildScoringPrompt should create a prompt for relevance scoring", () => {
    const prompt = promptManager.buildScoringPrompt(
      mockIssue,
      mockComments,
      "image processing"
    );

    expect(prompt.length).toBe(2);
    expect(prompt[0].role).toBe("system");
    expect(prompt[1].role).toBe("user");
    expect(prompt[1].content).toContain("score the following GitHub issue");
    expect(prompt[1].content).toContain("image processing");
    expect(prompt[1].content).toContain("relevanceScore");
  });

  test("buildWorkaroundExtractionPrompt should create a prompt for extracting workarounds", () => {
    const prompt = promptManager.buildWorkaroundExtractionPrompt(
      mockIssue,
      mockComments
    );

    expect(prompt.length).toBe(2);
    expect(prompt[0].role).toBe("system");
    expect(prompt[1].role).toBe("user");
    expect(prompt[1].content).toContain("extract any workarounds");
    expect(prompt[1].content).toContain("workarounds");
    expect(prompt[1].content).toContain("effectiveness");
  });

  test("buildSummaryPrompt should create a prompt for summarizing an issue", () => {
    const prompt = promptManager.buildSummaryPrompt(mockIssue, mockComments);

    expect(prompt.length).toBe(2);
    expect(prompt[0].role).toBe("system");
    expect(prompt[1].role).toBe("user");
    expect(prompt[1].content).toContain("create a concise summary");
    expect(prompt[1].content).toContain("summary");
  });

  test("createFewShotExample should return a valid example", () => {
    const example = promptManager.createFewShotExample();

    expect(example.role).toBe("assistant");
    expect(() => JSON.parse(example.content)).not.toThrow();

    const parsed = JSON.parse(example.content);
    expect(parsed.relevantIssues).toBeDefined();
    expect(parsed.relevantIssues.length).toBeGreaterThan(0);
    expect(parsed.summary).toBeDefined();
  });

  test("createBatchPrompts should split issues into batches", () => {
    const issues = [
      mockIssue,
      { ...mockIssue, id: 12346 },
      { ...mockIssue, id: 12347 },
    ];
    const commentsMap = new Map<number, RawComment[]>();
    commentsMap.set(mockIssue.id, mockComments);

    const batches = promptManager.createBatchPrompts(
      issues,
      commentsMap,
      "image processing",
      2
    );

    expect(batches.length).toBe(2);
    expect(batches[0][1].content).toContain(mockIssue.title);
    expect(batches[1][1].content).toContain(mockIssue.title);
  });

  test("parseStructuredResponse should parse valid JSON responses", () => {
    const validResponse = JSON.stringify({
      relevantIssues: [
        {
          id: 12345,
          title: "Test Issue",
          relevanceScore: 85,
          category: "Bug",
          priority: "high",
          summary: "This is a test issue",
          workarounds: [],
          tags: ["test"],
          sentiment: "neutral",
        },
      ],
      summary: {
        totalAnalyzed: 1,
        relevantFound: 1,
        topCategories: ["Bug"],
        analysisModel: "llama2",
      },
    });

    const parsed = promptManager.parseStructuredResponse(validResponse);

    expect(parsed).not.toBeNull();
    expect(parsed?.relevantIssues.length).toBe(1);
    expect(parsed?.relevantIssues[0].title).toBe("Test Issue");
  });

  test("parseStructuredResponse should handle LLM responses with extra text", () => {
    const responseWithExtra = `
Here's the analysis of the GitHub issues:

{
  "relevantIssues": [
    {
      "id": 12345,
      "title": "Test Issue",
      "relevanceScore": 85,
      "category": "Bug",
      "priority": "high",
      "summary": "This is a test issue",
      "workarounds": [],
      "tags": ["test"],
      "sentiment": "neutral"
    }
  ],
  "summary": {
    "totalAnalyzed": 1,
    "relevantFound": 1,
    "topCategories": ["Bug"],
    "analysisModel": "llama2"
  }
}

I hope this helps!`;

    const parsed = promptManager.parseStructuredResponse(responseWithExtra);

    expect(parsed).not.toBeNull();
    expect(parsed?.relevantIssues.length).toBe(1);
    expect(parsed?.relevantIssues[0].title).toBe("Test Issue");
  });

  test("parseStructuredResponse should return null for invalid responses", () => {
    const invalidResponse = "This is not a valid JSON response";

    const parsed = promptManager.parseStructuredResponse(invalidResponse);

    expect(parsed).toBeNull();
  });
});
