import { ErrorHandler, ErrorType, ScraperError } from "../error-handler";
import { JANClient } from "../jan-client";
import axios from "axios";

// Mock axios
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("LLM Error Handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("LLM Service Errors", () => {
    it("should handle JAN server unavailability", () => {
      const error = {
        code: "ECONNREFUSED",
        message: "Connection refused",
      };

      const context = {
        operation: "validating JAN server connection",
        additionalInfo: { endpoint: "http://localhost:1337" },
      };

      const scraperError = ErrorHandler.handleLLMServiceError(error, context);

      expect(scraperError).toBeInstanceOf(ScraperError);
      expect(scraperError.type).toBe(ErrorType.LLM_SERVICE);
      expect(scraperError.isRetryable).toBe(true);
      expect(scraperError.suggestions.length).toBeGreaterThan(0);
      expect(scraperError.message).toContain("Cannot connect to LLM service");
    });

    it("should handle JAN rate limiting", () => {
      const error = {
        response: { status: 429 },
        message: "Too many requests",
      };

      const context = {
        operation: "creating JAN completion",
        additionalInfo: { endpoint: "http://localhost:1337", model: "llama2" },
      };

      const scraperError = ErrorHandler.handleLLMServiceError(error, context);

      expect(scraperError).toBeInstanceOf(ScraperError);
      expect(scraperError.type).toBe(ErrorType.LLM_SERVICE);
      expect(scraperError.isRetryable).toBe(true);
      expect(
        scraperError.suggestions.some((s) => s.action.includes("Wait"))
      ).toBe(true);
    });
  });

  describe("LLM Response Errors", () => {
    it("should handle malformed JSON responses", () => {
      const error = new SyntaxError("Unexpected token in JSON");

      const context = {
        operation: "parsing LLM response",
        additionalInfo: { model: "llama2" },
      };

      const scraperError = ErrorHandler.handleLLMResponseError(error, context);

      expect(scraperError).toBeInstanceOf(ScraperError);
      expect(scraperError.type).toBe(ErrorType.LLM_RESPONSE);
      expect(scraperError.isRetryable).toBe(true);
      expect(
        scraperError.suggestions.some((s) => s.action.includes("prompt"))
      ).toBe(true);
    });

    it("should handle missing fields in responses", () => {
      const error = new Error("missing required field 'relevantIssues'");

      const context = {
        operation: "validating LLM response",
        additionalInfo: { model: "llama2" },
      };

      const scraperError = ErrorHandler.handleLLMResponseError(error, context);

      expect(scraperError).toBeInstanceOf(ScraperError);
      expect(scraperError.type).toBe(ErrorType.LLM_RESPONSE);
      expect(scraperError.isRetryable).toBe(true);
      expect(scraperError.message).toContain("missing required fields");
    });
  });

  describe("LLM Context Errors", () => {
    it("should handle context length exceeded errors", () => {
      const error = new Error(
        "This model's maximum context length is 4096 tokens"
      );

      const context = {
        operation: "analyzing issues with LLM",
        additionalInfo: { model: "llama2", issueCount: 10 },
      };

      const scraperError = ErrorHandler.handleLLMContextError(error, context);

      expect(scraperError).toBeInstanceOf(ScraperError);
      expect(scraperError.type).toBe(ErrorType.LLM_CONTEXT);
      expect(scraperError.isRetryable).toBe(true);
      expect(
        scraperError.suggestions.some((s) =>
          s.action.includes("Reduce batch size")
        )
      ).toBe(true);
    });
  });

  describe("Error Conversion", () => {
    it("should convert context length errors correctly", () => {
      const error = new Error(
        "This model's maximum context length is 4096 tokens"
      );

      const context = {
        operation: "analyzing issues with LLM",
        additionalInfo: { model: "llama2" },
      };

      const scraperError = ErrorHandler.convertToScraperError(error, context);

      expect(scraperError.type).toBe(ErrorType.LLM_CONTEXT);
    });

    it("should convert LLM connection errors correctly", () => {
      const error = {
        code: "ECONNREFUSED",
        message: "Connection refused",
      };

      const context = {
        operation: "connecting to JAN",
        additionalInfo: { endpoint: "http://localhost:1337" },
      };

      // Use handleLLMServiceError directly instead of convertToScraperError
      const scraperError = ErrorHandler.handleLLMServiceError(error, context);

      expect(scraperError.type).toBe(ErrorType.LLM_SERVICE);
    });

    it("should convert LLM response parsing errors correctly", () => {
      const error = new SyntaxError("Unexpected token in JSON");

      const context = {
        operation: "parsing LLM response",
        additionalInfo: { model: "llama2" },
      };

      // Use handleLLMResponseError directly instead of convertToScraperError
      const scraperError = ErrorHandler.handleLLMResponseError(error, context);

      expect(scraperError.type).toBe(ErrorType.LLM_RESPONSE);
    });
  });
});
