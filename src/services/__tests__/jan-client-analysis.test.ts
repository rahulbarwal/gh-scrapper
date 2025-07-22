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

describe("JANClient Analysis", () => {
  let janClient: JANClient;
  let promptManager: PromptManager;

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
    {
      id: 1002,
      user: { login: "user123" },
      body: "I found that using the desktop app works fine with large images.",
      created_at: "2023-01-02T12:00:00Z",
      author_association: "NONE",
    },
  ]);

  mockComments.set(12346, [
    {
      id: 1003,
      user: { login: "developer" },
      body: "We're planning to add this in the next release.",
      created_at: "2023-01-03T12:00:00Z",
      author_association: "MEMBER",
    },
  ]);

  // Mock LLM response
  const mockLLMResponse: LLMAnalysisResponse = {
    relevantIssues: [
      {
        id: 12345,
        title: "App crashes when uploading large images",
        relevanceScore: 85,
        category: "Performance",
        priority: "high",
        summary:
          "The application crashes when users attempt to upload images larger than 10MB due to memory allocation issues.",
        workarounds: [
          {
            description: "Resize images to under 10MB before uploading",
            author: "maintainer",
            authorType: "maintainer",
            effectiveness: "confirmed",
            confidence: 90,
          },
          {
            description: "Use the desktop app instead of the web interface",
            author: "user123",
            authorType: "user",
            effectiveness: "suggested",
            confidence: 75,
          },
        ],
        tags: ["crash", "upload", "images", "memory-issue"],
        sentiment: "negative",
      },
    ],
    summary: {
      totalAnalyzed: 2,
      relevantFound: 1,
      topCategories: ["Performance"],
      analysisModel: "llama2",
    },
  };

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

  test("analyzeIssues should process issues and return structured analysis", async () => {
    // Mock the batch prompts creation
    jest.spyOn(promptManager, "createBatchPrompts").mockReturnValue([
      [
        { role: "system", content: "You are an expert GitHub issue analyst" },
        { role: "user", content: "Analyze these issues" },
      ],
    ]);

    // Mock OpenAI completion
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
            content: JSON.stringify(mockLLMResponse),
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
    jest
      .spyOn(promptManager, "parseStructuredResponse")
      .mockReturnValue(mockLLMResponse);

    // Execute analysis
    const result = await janClient.analyzeIssues(
      mockIssues,
      mockComments,
      "image processing",
      promptManager,
      2 // batch size
    );

    // Verify results
    expect(result).toBeDefined();
    expect(result.relevantIssues).toHaveLength(1);
    expect(result.relevantIssues[0].id).toBe(12345);
    expect(result.relevantIssues[0].workarounds).toHaveLength(2);
    expect(result.summary.totalAnalyzed).toBe(2);
    expect(result.summary.relevantFound).toBe(1);

    // Verify method calls
    expect(promptManager.createBatchPrompts).toHaveBeenCalledWith(
      mockIssues,
      mockComments,
      "image processing",
      2
    );
    expect(mockedOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
    expect(promptManager.parseStructuredResponse).toHaveBeenCalledTimes(1);
  });

  test("analyzeIssues should handle multiple batches", async () => {
    // Mock the batch prompts creation to return multiple batches
    jest.spyOn(promptManager, "createBatchPrompts").mockReturnValue([
      [
        { role: "system", content: "You are an expert GitHub issue analyst" },
        { role: "user", content: "Analyze batch 1" },
      ],
      [
        { role: "system", content: "You are an expert GitHub issue analyst" },
        { role: "user", content: "Analyze batch 2" },
      ],
    ]);

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
              content: JSON.stringify(mockLLMResponse),
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
    jest
      .spyOn(promptManager, "parseStructuredResponse")
      .mockReturnValue(mockLLMResponse);

    // Execute analysis
    const result = await janClient.analyzeIssues(
      mockIssues,
      mockComments,
      "image processing",
      promptManager,
      1 // small batch size to force multiple batches
    );

    // Verify results
    expect(result).toBeDefined();
    expect(result.relevantIssues).toHaveLength(2); // 1 from each batch
    expect(result.summary.totalAnalyzed).toBe(4); // 2 from each batch
    expect(result.summary.relevantFound).toBe(2); // 1 from each batch

    // Verify method calls
    expect(promptManager.createBatchPrompts).toHaveBeenCalledWith(
      mockIssues,
      mockComments,
      "image processing",
      1
    );
    expect(mockedOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
    expect(promptManager.parseStructuredResponse).toHaveBeenCalledTimes(2);
  });

  test("analyzeIssues should handle malformed LLM responses", async () => {
    // Mock the batch prompts creation
    jest.spyOn(promptManager, "createBatchPrompts").mockReturnValue([
      [
        { role: "system", content: "You are an expert GitHub issue analyst" },
        { role: "user", content: "Analyze these issues" },
      ],
    ]);

    // Mock OpenAI completion with invalid JSON
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

    // Mock response parsing to fail
    jest.spyOn(promptManager, "parseStructuredResponse").mockReturnValue(null);

    // Mock simplified prompt creation
    jest
      .spyOn(janClient as any, "createSimplifiedPrompt")
      .mockReturnValue([{ role: "system", content: "Simplified prompt" }]);

    // Mock fallback response
    mockedOpenAI.chat.completions.create.mockImplementationOnce(() => {
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
    });

    // Execute analysis
    const result = await janClient.analyzeIssues(
      mockIssues,
      mockComments,
      "image processing",
      promptManager,
      2 // batch size
    );

    // Verify graceful degradation
    expect(result).toBeDefined();
    expect(result.relevantIssues).toEqual([]);
    expect(result.summary.totalAnalyzed).toBe(2);
    expect(result.summary.relevantFound).toBe(0);
  });

  test("analyzeIssues should handle context length errors by reducing batch size", async () => {
    // Mock the batch prompts creation
    jest.spyOn(promptManager, "createBatchPrompts").mockReturnValue([
      [
        { role: "system", content: "You are an expert GitHub issue analyst" },
        { role: "user", content: "Analyze these issues" },
      ],
    ]);

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
              content: JSON.stringify(mockLLMResponse),
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
    jest
      .spyOn(promptManager, "parseStructuredResponse")
      .mockReturnValue(mockLLMResponse);

    // Execute analysis
    const result = await janClient.analyzeIssues(
      mockIssues,
      mockComments,
      "image processing",
      promptManager,
      2 // batch size
    );

    // Verify results
    expect(result).toBeDefined();
    expect(result.relevantIssues).toHaveLength(1);
    expect(result.summary.totalAnalyzed).toBe(2);

    // Verify method calls - should have tried with smaller batch size
    expect(mockedOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
  });

  test("analyzeIssues should merge results from multiple batches", async () => {
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

    // Mock the batch prompts creation to return multiple batches
    jest
      .spyOn(promptManager, "createBatchPrompts")
      .mockReturnValue([
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

    // Mock response parsing for different responses
    jest
      .spyOn(promptManager, "parseStructuredResponse")
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

    // Verify merged results
    expect(result).toBeDefined();
    expect(result.relevantIssues).toHaveLength(2);
    expect(result.relevantIssues[0].id).toBe(12345);
    expect(result.relevantIssues[1].id).toBe(12346);
    expect(result.summary.totalAnalyzed).toBe(2);
    expect(result.summary.relevantFound).toBe(2);
    expect(result.summary.topCategories).toContain("Performance");
    expect(result.summary.topCategories).toContain("Feature");
  });

  test("validateConnection should check JAN server availability", async () => {
    // Test successful connection
    const result = await janClient.validateConnection();
    expect(result).toBe(true);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      "http://localhost:1337/health",
      expect.any(Object)
    );

    // Test failed connection
    mockedAxios.get.mockRejectedValueOnce({ code: "ECONNREFUSED" });
    await expect(janClient.validateConnection()).rejects.toThrow(
      "Cannot connect to JAN server"
    );
  });

  test("validateModel should check if model is loaded in JAN", async () => {
    // Test with valid model
    const result = await janClient.validateModel("llama2");
    expect(result).toBe(true);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      "http://localhost:1337/v1/models",
      expect.any(Object)
    );

    // Test with invalid model
    mockedAxios.get.mockResolvedValueOnce({
      status: 200,
      data: { data: [{ id: "mistral" }] },
    });

    await expect(janClient.validateModel("llama2")).rejects.toThrow(
      "Model 'llama2' is not loaded in JAN"
    );
  });
});
