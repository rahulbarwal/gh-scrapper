import { JANClient } from "../jan-client";
import { ErrorHandler, ErrorType, ScraperError } from "../error-handler";
import axios from "axios";
import { OpenAI } from "openai";
import { JANMessage } from "../../models";

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

describe("LLM Integration Error Handling", () => {
  let janClient: JANClient;
  let promptManager: any;

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
  });

  describe("Retry Logic", () => {
    it("should retry failed LLM requests with exponential backoff", async () => {
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
  });

  describe("Graceful Degradation", () => {
    it("should handle malformed LLM responses with fallback strategies", async () => {
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

      // Set up test data
      const issues = [{ id: 1, title: "Test Issue" }];
      const comments = new Map();

      // Execute analysis
      const result = await janClient.analyzeIssues(
        issues as any,
        comments,
        "test-area",
        promptManager,
        1 // Small batch size to trigger fallback
      );

      // Verify graceful degradation
      expect(result).toBeDefined();
      expect(result.relevantIssues).toEqual([]);
      expect(result.summary.totalAnalyzed).toBe(1);
    });
  });
});
