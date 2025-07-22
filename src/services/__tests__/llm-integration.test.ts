import { JANClient } from "../jan-client";
import { PromptManager } from "../prompt-manager";
import { ErrorHandler, ErrorType, ScraperError } from "../error-handler";
import axios from "axios";
import { OpenAI } from "openai";
import {
  JANMessage,
  RawGitHubIssue,
  RawComment,
  LLMAnalysisResponse,
} from "../../models";

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

describe("LLM Integration", () => {
  let janClient: JANClient;
  let promptManager: any;

  // Sample test data
  const mockIssues: RawGitHubIssue[] = [
    {
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
    },
    {
      id: 12346,
      number: 43,
      title: "Feature request: Add dark mode support",
      body: "It would be great to have dark mode support for the application.",
      labels: [{ name: "enhancement" }],
      state: "open",
      created_at: "2023-01-03T00:00:00Z",
      updated_at: "2023-01-04T00:00:00Z",
      user: { login: "user123" },
      html_url: "https://github.com/test/repo/issues/43",
      comments_url: "https://api.github.com/repos/test/repo/issues/43/comments",
      comments: 1,
    },
  ];

  const mockComments = new Map<number, RawComment[]>();
  mockComments.set(12345, [
    {
      id: 1001,
      user: { login: "maintainer" },
      body: "This is a known issue. As a workaround, try resizing your images before uploading.",
      created_at: "2023-01-01T12:00:00Z",
      author_association: "MEMBER",
    },
  ]);

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock prompt manager
    promptManager = {
      createBatchPrompts: jest.fn(),
      parseStructuredResponse: jest.fn(),
      formatIssueData: jest.fn((issue: any, comments: any) => {
        return `Issue #${issue.id}: ${issue.title}`;
      }),
    };

    // Initialize JAN client
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

  describe("Error Handling", () => {
    it("should retry failed LLM requests with exponential backoff", async () => {
      // Mock OpenAI to fail once then succeed
      let callCount = 0;
      mockedOpenAI.chat.completions.create.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw { status: 429, message: "Rate limit exceeded" };
        }

        return Promise.resolve({
          id: "test-id",
          object: "chat.completion",
          created: Date.now(),
          model: "llama2",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content:
                  '{"relevantIssues":[],"summary":{"totalAnalyzed":0,"relevantFound":0,"topCategories":[],"analysisModel":"llama2"}}',
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
      });

      // Mock successful response parsing
      promptManager.parseStructuredResponse.mockImplementation(
        (content: string) => {
          try {
            return JSON.parse(content);
          } catch (e) {
            return null;
          }
        }
      );

      // Set up test data
      const messages: JANMessage[] = [
        { role: "system", content: "You are an assistant" },
        { role: "user", content: "Hello" },
      ];

      // Execute with retry
      const result = await janClient.createCompletion(messages);

      // Verify retry behavior
      expect(mockedOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
      expect(result.choices[0].message.content).toBeDefined();
    });

    it("should handle malformed LLM responses with fallback strategies", async () => {
      // Mock batch prompts
      promptManager.createBatchPrompts.mockReturnValue([
        [{ role: "system", content: "Analyze issues" }],
      ]);

      // Mock OpenAI to return invalid JSON
      mockedOpenAI.chat.completions.create.mockResolvedValue({
        id: "test-id",
        object: "chat.completion",
        created: Date.now(),
        model: "llama2",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "This is not valid JSON",
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

      // Mock failed response parsing
      promptManager.parseStructuredResponse.mockReturnValue(null);

      // Execute analysis
      const result = await janClient.analyzeIssues(
        mockIssues.slice(0, 1) as any,
        mockComments,
        "test-area",
        promptManager,
        1 // Small batch size to trigger fallback
      );

      // Verify graceful degradation
      expect(result).toBeDefined();
      expect(result.relevantIssues).toEqual([]);
      expect(result.summary.totalAnalyzed).toBe(1);
      expect(result.summary.processingError).toBe(true);
    });
  });

  describe("Batch Processing", () => {
    it("should process issues in batches", async () => {
      // Create a large set of mock issues
      const largeIssueSet = Array.from({ length: 10 }, (_, i) => ({
        ...mockIssues[0],
        id: 12345 + i,
        number: 42 + i,
        title: `Issue ${i + 1}`,
      }));

      // Mock batch prompts to return 5 batches (2 issues per batch)
      promptManager.createBatchPrompts.mockReturnValue([
        [{ role: "system", content: "Batch 1" }],
        [{ role: "system", content: "Batch 2" }],
        [{ role: "system", content: "Batch 3" }],
        [{ role: "system", content: "Batch 4" }],
        [{ role: "system", content: "Batch 5" }],
      ]);

      // Create a mock response
      const mockResponse: LLMAnalysisResponse = {
        relevantIssues: [
          {
            id: 12345,
            title: "Test Issue",
            relevanceScore: 80,
            category: "Bug",
            priority: "high",
            summary: "Test summary",
            workarounds: [],
            tags: ["test"],
            sentiment: "neutral",
          },
        ],
        summary: {
          totalAnalyzed: 2,
          relevantFound: 1,
          topCategories: ["Bug"],
          analysisModel: "llama2",
        },
      };

      // Mock OpenAI completion for multiple calls
      mockedOpenAI.chat.completions.create.mockImplementation(() => {
        return Promise.resolve({
          id: "test-id",
          object: "chat.completion",
          created: Date.now(),
          model: "llama2",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: JSON.stringify(mockResponse),
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
      });

      // Mock response parsing
      promptManager.parseStructuredResponse.mockImplementation((content) => {
        return JSON.parse(content);
      });

      // Execute analysis
      const result = await janClient.analyzeIssues(
        largeIssueSet as any,
        mockComments,
        "test-area",
        promptManager,
        2 // 2 issues per batch
      );

      // Verify results
      expect(result).toBeDefined();
      expect(result.summary.totalBatches).toBeUndefined(); // No errors
      expect(result.summary.relevantFound).toBe(5); // 1 from each batch

      // Verify method calls
      expect(promptManager.createBatchPrompts).toHaveBeenCalledWith(
        largeIssueSet,
        mockComments,
        "test-area",
        2
      );

      expect(promptManager.parseStructuredResponse).toHaveBeenCalledTimes(5);
    });

    it("should handle context length errors by reducing batch size", async () => {
      // Mock batch prompts
      promptManager.createBatchPrompts.mockReturnValue([
        [{ role: "system", content: "Analyze issues" }],
      ]);

      // Create a mock response
      const mockResponse: LLMAnalysisResponse = {
        relevantIssues: [
          {
            id: 12345,
            title: "Test Issue",
            relevanceScore: 80,
            category: "Bug",
            priority: "high",
            summary: "Test summary",
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
      };

      // First call fails with context length error, second succeeds
      let callCount = 0;
      mockedOpenAI.chat.completions.create.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw {
            message: "This model's maximum context length is 4096 tokens",
            status: 400,
          };
        }
        return Promise.resolve({
          id: "test-id",
          object: "chat.completion",
          created: Date.now(),
          model: "llama2",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: JSON.stringify(mockResponse),
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
      });

      // Mock response parsing
      promptManager.parseStructuredResponse.mockImplementation((content) => {
        return JSON.parse(content);
      });

      // Mock createBatchPrompts to be called twice with different batch sizes
      promptManager.createBatchPrompts
        .mockImplementationOnce(() => {
          return [
            [{ role: "system", content: "Analyze issues (batch size 2)" }],
          ];
        })
        .mockImplementationOnce(() => {
          return [
            [{ role: "system", content: "Analyze issues (batch size 1)" }],
          ];
        });

      // Execute analysis
      const result = await janClient.analyzeIssues(
        mockIssues,
        mockComments,
        "test-area",
        promptManager,
        2 // Start with batch size 2
      );

      // Verify results
      expect(result).toBeDefined();
      expect(result.relevantIssues).toHaveLength(1);
      expect(result.summary.totalAnalyzed).toBe(1);

      // Verify method calls - should have tried with smaller batch size
      expect(mockedOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
      expect(promptManager.createBatchPrompts).toHaveBeenCalledTimes(2);
    });
  });

  describe("Result Merging", () => {
    it("should merge results from multiple batches", async () => {
      // Create two different batch responses
      const batchResponse1: LLMAnalysisResponse = {
        relevantIssues: [
          {
            id: 12345,
            title: "Issue 1",
            relevanceScore: 85,
            category: "Performance",
            priority: "high",
            summary: "Summary 1",
            workarounds: [],
            tags: ["performance"],
            sentiment: "negative",
          },
        ],
        summary: {
          totalAnalyzed: 1,
          relevantFound: 1,
          topCategories: ["Performance"],
          analysisModel: "llama2",
        },
      };

      const batchResponse2: LLMAnalysisResponse = {
        relevantIssues: [
          {
            id: 12346,
            title: "Issue 2",
            relevanceScore: 75,
            category: "Feature",
            priority: "medium",
            summary: "Summary 2",
            workarounds: [],
            tags: ["feature"],
            sentiment: "positive",
          },
        ],
        summary: {
          totalAnalyzed: 1,
          relevantFound: 1,
          topCategories: ["Feature"],
          analysisModel: "llama2",
        },
      };

      // Mock batch prompts
      promptManager.createBatchPrompts.mockReturnValue([
        [{ role: "system", content: "Batch 1" }],
        [{ role: "system", content: "Batch 2" }],
      ]);

      // Mock OpenAI completion for multiple calls with different responses
      mockedOpenAI.chat.completions.create
        .mockImplementationOnce(() => {
          return Promise.resolve({
            id: "test-id-1",
            object: "chat.completion",
            created: Date.now(),
            model: "llama2",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: JSON.stringify(batchResponse1),
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
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            id: "test-id-2",
            object: "chat.completion",
            created: Date.now(),
            model: "llama2",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: JSON.stringify(batchResponse2),
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
        });

      // Mock response parsing
      promptManager.parseStructuredResponse
        .mockImplementationOnce(() => batchResponse1)
        .mockImplementationOnce(() => batchResponse2);

      // Execute analysis
      const result = await janClient.analyzeIssues(
        mockIssues,
        mockComments,
        "test-area",
        promptManager,
        1 // 1 issue per batch
      );

      // Verify results
      expect(result).toBeDefined();
      expect(result.relevantIssues).toHaveLength(2);
      expect(result.relevantIssues[0].id).toBe(12345);
      expect(result.relevantIssues[1].id).toBe(12346);
      expect(result.summary.totalAnalyzed).toBe(2);
      expect(result.summary.relevantFound).toBe(2);
      expect(result.summary.topCategories).toContain("Performance");
      expect(result.summary.topCategories).toContain("Feature");
    });

    it("should handle partial failures in batch processing", async () => {
      // Mock batch prompts for 3 batches
      promptManager.createBatchPrompts.mockReturnValue([
        [{ role: "system", content: "Batch 1" }],
        [{ role: "system", content: "Batch 2" }],
        [{ role: "system", content: "Batch 3" }],
      ]);

      // Create mock responses
      const mockResponse1: LLMAnalysisResponse = {
        relevantIssues: [
          {
            id: 1,
            title: "Issue 1",
            relevanceScore: 80,
            category: "Bug",
            priority: "high",
            summary: "Summary 1",
            workarounds: [],
            tags: [],
            sentiment: "neutral",
          },
        ],
        summary: {
          totalAnalyzed: 1,
          relevantFound: 1,
          topCategories: ["Bug"],
          analysisModel: "llama2",
        },
      };

      const mockResponse3: LLMAnalysisResponse = {
        relevantIssues: [
          {
            id: 3,
            title: "Issue 3",
            relevanceScore: 70,
            category: "Feature",
            priority: "medium",
            summary: "Summary 3",
            workarounds: [],
            tags: [],
            sentiment: "positive",
          },
        ],
        summary: {
          totalAnalyzed: 1,
          relevantFound: 1,
          topCategories: ["Feature"],
          analysisModel: "llama2",
        },
      };

      // Mock OpenAI completion - first and third succeed, second fails
      mockedOpenAI.chat.completions.create
        .mockImplementationOnce(() => {
          return Promise.resolve({
            id: "test-id-1",
            object: "chat.completion",
            created: Date.now(),
            model: "llama2",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: JSON.stringify(mockResponse1),
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
        })
        .mockImplementationOnce(() => {
          throw new Error("Network error");
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            id: "test-id-3",
            object: "chat.completion",
            created: Date.now(),
            model: "llama2",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: JSON.stringify(mockResponse3),
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
        });

      // Mock response parsing
      promptManager.parseStructuredResponse
        .mockImplementationOnce(() => mockResponse1)
        .mockImplementationOnce(() => mockResponse3);

      // Create a mock for createEmptyBatchResult
      const mockEmptyResult: LLMAnalysisResponse = {
        relevantIssues: [],
        summary: {
          totalAnalyzed: 1,
          relevantFound: 0,
          topCategories: [],
          analysisModel: "llama2",
          processingError: true,
        },
      };

      jest
        .spyOn(janClient as any, "createEmptyBatchResult")
        .mockReturnValue(mockEmptyResult);

      // Create test issues
      const testIssues = [
        { ...mockIssues[0], id: 1, number: 1 },
        { ...mockIssues[0], id: 2, number: 2 },
        { ...mockIssues[0], id: 3, number: 3 },
      ];

      // Execute analysis
      const result = await janClient.analyzeIssues(
        testIssues as any,
        mockComments,
        "test-area",
        promptManager,
        1 // 1 issue per batch
      );

      // Verify results with partial failures
      expect(result).toBeDefined();
      expect(result.relevantIssues).toHaveLength(2); // 2 successful batches
      expect(result.summary.processingErrors).toBe(1); // 1 failed batch
      expect(result.summary.totalBatches).toBe(3); // 3 total batches
    });
  });
});
