import { JANClient } from "../jan-client";
import { PromptManager } from "../prompt-manager";
import axios from "axios";
import { OpenAI } from "openai";
import { LLMAnalysisResponse, RawGitHubIssue, RawComment } from "../../models";

// Mock axios and OpenAI
jest.mock("axios");
jest.mock("openai");

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedOpenAI = {
  chat: {
    completions: {
      create: jest.fn(),
    },
  },
};

// Mock the OpenAI constructor
(OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => {
  return mockedOpenAI as any;
});

describe("Batch Processing and Context Management", () => {
  let janClient: JANClient;
  let promptManager: PromptManager;

  // Sample test data - create a larger dataset for batch testing
  const createMockIssues = (count: number): RawGitHubIssue[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: 12345 + i,
      number: 42 + i,
      title: `Test Issue ${i + 1}`,
      body: `This is the description for test issue ${
        i + 1
      }. It contains enough text to simulate a real issue.`,
      labels: [{ name: i % 2 === 0 ? "bug" : "enhancement" }],
      state: i % 3 === 0 ? "closed" : "open",
      created_at: `2023-01-${(i % 28) + 1}T00:00:00Z`,
      updated_at: `2023-01-${(i % 28) + 2}T00:00:00Z`,
      user: { login: `user${i}` },
      html_url: `https://github.com/test/repo/issues/${42 + i}`,
      comments_url: `https://api.github.com/repos/test/repo/issues/${
        42 + i
      }/comments`,
      comments: i % 4,
    }));
  };

  const mockIssues = createMockIssues(20); // Create 20 mock issues

  // Create mock comments
  const mockComments = new Map<number, RawComment[]>();
  mockIssues.forEach((issue) => {
    if (issue.comments > 0) {
      mockComments.set(
        issue.id,
        Array.from({ length: issue.comments }, (_, i) => ({
          id: 1000 + i,
          user: { login: i % 2 === 0 ? "maintainer" : `user${i}` },
          body: `This is comment ${i + 1} for issue #${issue.number}. ${
            i % 2 === 0 ? "Here's a workaround: try doing X instead of Y." : ""
          }`,
          created_at: `2023-01-${(i % 28) + 1}T12:00:00Z`,
          author_association: i % 2 === 0 ? "MEMBER" : "NONE",
        }))
      );
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    promptManager = new PromptManager();
    janClient = new JANClient({
      endpoint: "http://localhost:1337",
      model: "llama2",
      maxRetries: 2,
    });

    // Mock validateModel to succeed
    mockedAxios.get.mockImplementation((url) => {
      if (url.includes("/health")) {
        return Promise.resolve({ status: 200 });
      }
      if (url.includes("/v1/models")) {
        return Promise.resolve({
          status: 200,
          data: { data: [{ id: "llama2" }] },
        });
      }
      return Promise.reject(new Error("Unexpected URL"));
    });
  });

  test("should create appropriate number of batches based on batch size", () => {
    // Test with different batch sizes
    const batchSizes = [1, 2, 5, 10, 20];

    batchSizes.forEach((batchSize) => {
      const batches = promptManager.createBatchPrompts(
        mockIssues,
        mockComments,
        "test area",
        batchSize
      );

      const expectedBatchCount = Math.ceil(mockIssues.length / batchSize);
      expect(batches).toHaveLength(expectedBatchCount);

      // Check that each batch has the correct structure
      batches.forEach((batch) => {
        expect(batch).toHaveLength(2); // System and user messages
        expect(batch[0].role).toBe("system");
        expect(batch[1].role).toBe("user");
      });
    });
  });

  test("should handle dynamic batch size reduction for context length errors", async () => {
    // Mock batch prompts creation
    jest
      .spyOn(promptManager, "createBatchPrompts")
      .mockImplementationOnce(() => {
        // First call with batch size 10
        return [
          [
            {
              role: "system",
              content: "You are an expert GitHub issue analyst",
            },
            { role: "user", content: "Analyze these 10 issues" },
          ],
        ];
      })
      .mockImplementationOnce(() => {
        // Second call with batch size 5
        return [
          [
            {
              role: "system",
              content: "You are an expert GitHub issue analyst",
            },
            { role: "user", content: "Analyze these 5 issues" },
          ],
        ];
      })
      .mockImplementationOnce(() => {
        // Third call with batch size 2
        return [
          [
            {
              role: "system",
              content: "You are an expert GitHub issue analyst",
            },
            { role: "user", content: "Analyze these 2 issues" },
          ],
        ];
      });

    // Mock OpenAI completions to fail with context length errors twice, then succeed
    mockedOpenAI.chat.completions.create
      .mockRejectedValueOnce({
        message: "This model's maximum context length is 4096 tokens",
        status: 400,
      })
      .mockRejectedValueOnce({
        message: "This model's maximum context length is 4096 tokens",
        status: 400,
      })
      .mockResolvedValueOnce({
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: "llama2",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({
                relevantIssues: [],
                summary: {
                  totalAnalyzed: 2,
                  relevantFound: 0,
                  topCategories: [],
                  analysisModel: "llama2",
                },
              }),
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      });

    // Mock response parsing
    jest.spyOn(promptManager, "parseStructuredResponse").mockReturnValue({
      relevantIssues: [],
      summary: {
        totalAnalyzed: 2,
        relevantFound: 0,
        topCategories: [],
        analysisModel: "llama2",
      },
    });

    // Execute analysis with initial batch size of 10
    const result = await janClient.analyzeIssues(
      mockIssues.slice(0, 10),
      mockComments,
      "test area",
      promptManager,
      10 // Initial batch size
    );

    // Verify the batch size was reduced twice before succeeding
    expect(promptManager.createBatchPrompts).toHaveBeenCalledTimes(3);
    expect(promptManager.createBatchPrompts).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.anything(),
      "test area",
      10
    );
    expect(promptManager.createBatchPrompts).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.anything(),
      "test area",
      5
    );
    expect(promptManager.createBatchPrompts).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      expect.anything(),
      "test area",
      2
    );

    // Verify OpenAI was called three times
    expect(mockedOpenAI.chat.completions.create).toHaveBeenCalledTimes(3);
  });

  test("should merge results from multiple batches correctly", async () => {
    // Create mock batch responses
    const batchResponses: LLMAnalysisResponse[] = [
      {
        relevantIssues: [
          {
            id: 12345,
            title: "Issue 1",
            relevanceScore: 85,
            category: "Bug",
            priority: "high",
            summary: "Summary 1",
            workarounds: [],
            tags: ["bug"],
            sentiment: "negative",
          },
        ],
        summary: {
          totalAnalyzed: 5,
          relevantFound: 1,
          topCategories: ["Bug"],
          analysisModel: "llama2",
        },
      },
      {
        relevantIssues: [
          {
            id: 12350,
            title: "Issue 6",
            relevanceScore: 75,
            category: "Feature",
            priority: "medium",
            summary: "Summary 6",
            workarounds: [],
            tags: ["feature"],
            sentiment: "positive",
          },
          {
            id: 12352,
            title: "Issue 8",
            relevanceScore: 90,
            category: "Performance",
            priority: "high",
            summary: "Summary 8",
            workarounds: [],
            tags: ["performance"],
            sentiment: "negative",
          },
        ],
        summary: {
          totalAnalyzed: 5,
          relevantFound: 2,
          topCategories: ["Feature", "Performance"],
          analysisModel: "llama2",
        },
      },
      {
        relevantIssues: [
          {
            id: 12355,
            title: "Issue 11",
            relevanceScore: 80,
            category: "Documentation",
            priority: "low",
            summary: "Summary 11",
            workarounds: [],
            tags: ["docs"],
            sentiment: "neutral",
          },
        ],
        summary: {
          totalAnalyzed: 5,
          relevantFound: 1,
          topCategories: ["Documentation"],
          analysisModel: "llama2",
        },
      },
    ];

    // Mock batch prompts creation
    jest
      .spyOn(promptManager, "createBatchPrompts")
      .mockReturnValue([
        [{ role: "system", content: "Batch 1" }],
        [{ role: "system", content: "Batch 2" }],
        [{ role: "system", content: "Batch 3" }],
      ]);

    // Mock OpenAI completions for each batch
    mockedOpenAI.chat.completions.create
      .mockResolvedValueOnce({
        id: "test-id-1",
        object: "chat.completion",
        created: Date.now(),
        model: "llama2",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify(batchResponses[0]),
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      })
      .mockResolvedValueOnce({
        id: "test-id-2",
        object: "chat.completion",
        created: Date.now(),
        model: "llama2",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify(batchResponses[1]),
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      })
      .mockResolvedValueOnce({
        id: "test-id-3",
        object: "chat.completion",
        created: Date.now(),
        model: "llama2",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify(batchResponses[2]),
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

    // Mock response parsing
    jest
      .spyOn(promptManager, "parseStructuredResponse")
      .mockReturnValueOnce(batchResponses[0])
      .mockReturnValueOnce(batchResponses[1])
      .mockReturnValueOnce(batchResponses[2]);

    // Execute analysis
    const result = await janClient.analyzeIssues(
      mockIssues.slice(0, 15),
      mockComments,
      "test area",
      promptManager,
      5 // Batch size
    );

    // Verify the merged results
    expect(result).toBeDefined();
    expect(result.relevantIssues).toHaveLength(4); // Total from all batches
    expect(result.summary.totalAnalyzed).toBe(15); // 5 + 5 + 5
    expect(result.summary.relevantFound).toBe(4); // 1 + 2 + 1

    // Check that all categories are included in the merged result
    expect(result.summary.topCategories).toContain("Bug");
    expect(result.summary.topCategories).toContain("Feature");
    expect(result.summary.topCategories).toContain("Performance");
    expect(result.summary.topCategories).toContain("Documentation");

    // Check that all issues are included
    const issueIds = result.relevantIssues.map((issue) => issue.id);
    expect(issueIds).toContain(12345);
    expect(issueIds).toContain(12350);
    expect(issueIds).toContain(12352);
    expect(issueIds).toContain(12355);
  });

  test("should handle partial batch failures gracefully", async () => {
    // Mock batch prompts creation
    jest
      .spyOn(promptManager, "createBatchPrompts")
      .mockReturnValue([
        [{ role: "system", content: "Batch 1" }],
        [{ role: "system", content: "Batch 2" }],
        [{ role: "system", content: "Batch 3" }],
      ]);

    // Create a successful response
    const successResponse: LLMAnalysisResponse = {
      relevantIssues: [
        {
          id: 12345,
          title: "Issue 1",
          relevanceScore: 85,
          category: "Bug",
          priority: "high",
          summary: "Summary 1",
          workarounds: [],
          tags: ["bug"],
          sentiment: "negative",
        },
      ],
      summary: {
        totalAnalyzed: 5,
        relevantFound: 1,
        topCategories: ["Bug"],
        analysisModel: "llama2",
      },
    };

    // Mock empty batch result for failed batches
    const emptyBatchResult: LLMAnalysisResponse = {
      relevantIssues: [],
      summary: {
        totalAnalyzed: 5,
        relevantFound: 0,
        topCategories: [],
        analysisModel: "llama2",
        processingError: true,
      },
    };

    // Spy on createEmptyBatchResult
    jest
      .spyOn(janClient as any, "createEmptyBatchResult")
      .mockReturnValue(emptyBatchResult);

    // Mock OpenAI completions - first and third succeed, second fails
    mockedOpenAI.chat.completions.create
      .mockResolvedValueOnce({
        id: "test-id-1",
        object: "chat.completion",
        created: Date.now(),
        model: "llama2",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify(successResponse),
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      })
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({
        id: "test-id-3",
        object: "chat.completion",
        created: Date.now(),
        model: "llama2",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify(successResponse),
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

    // Mock response parsing
    jest
      .spyOn(promptManager, "parseStructuredResponse")
      .mockReturnValueOnce(successResponse)
      .mockReturnValueOnce(successResponse);

    // Execute analysis
    const result = await janClient.analyzeIssues(
      mockIssues.slice(0, 15),
      mockComments,
      "test area",
      promptManager,
      5 // Batch size
    );

    // Verify the results with partial failure
    expect(result).toBeDefined();
    expect(result.relevantIssues).toHaveLength(2); // 1 from each successful batch
    expect(result.summary.totalAnalyzed).toBe(15); // 5 + 5 + 5
    expect(result.summary.relevantFound).toBe(2); // 1 + 0 + 1
    expect(result.summary.processingErrors).toBe(1); // 1 failed batch
    expect(result.summary.totalBatches).toBe(3); // 3 total batches
  });
});
