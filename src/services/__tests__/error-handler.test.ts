import {
  ErrorHandler,
  ScraperError,
  ErrorType,
  ErrorContext,
} from "../error-handler";

describe("ErrorHandler", () => {
  const mockContext: ErrorContext = {
    operation: "test operation",
    repository: "owner/repo",
    productArea: "test area",
  };

  describe("handleAuthenticationError", () => {
    it("should handle 401 authentication errors", () => {
      const mockError = {
        response: {
          status: 401,
          data: { message: "Bad credentials" },
        },
      };

      const result = ErrorHandler.handleAuthenticationError(
        mockError,
        mockContext
      );

      expect(result).toBeInstanceOf(ScraperError);
      expect(result.type).toBe(ErrorType.AUTHENTICATION);
      expect(result.message).toContain("GitHub authentication failed");
      expect(result.suggestions).toHaveLength(3);
      expect(result.suggestions[0].action).toBe("Check your GitHub token");
      expect(result.isRetryable).toBe(false);
    });

    it("should handle 403 rate limit errors", () => {
      const mockError = {
        response: {
          status: 403,
          headers: {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": "1234567890",
          },
          data: { message: "API rate limit exceeded" },
        },
      };

      const result = ErrorHandler.handleAuthenticationError(
        mockError,
        mockContext
      );

      expect(result.type).toBe(ErrorType.RATE_LIMIT);
      expect(result.message).toContain("rate limit exceeded");
      expect(result.isRetryable).toBe(true);
    });

    it("should handle 403 permission errors", () => {
      const mockError = {
        response: {
          status: 403,
          headers: {
            "x-ratelimit-remaining": "100",
          },
          data: { message: "Forbidden" },
        },
      };

      const result = ErrorHandler.handleAuthenticationError(
        mockError,
        mockContext
      );

      expect(result.type).toBe(ErrorType.AUTHENTICATION);
      expect(result.message).toContain("access forbidden");
      expect(result.suggestions).toContainEqual(
        expect.objectContaining({
          action: "Check token permissions",
          priority: "high",
        })
      );
    });
  });

  describe("handleNetworkError", () => {
    it("should handle ENOTFOUND errors", () => {
      const mockError = {
        code: "ENOTFOUND",
        message: "getaddrinfo ENOTFOUND api.github.com",
      };

      const result = ErrorHandler.handleNetworkError(mockError, mockContext);

      expect(result.type).toBe(ErrorType.NETWORK);
      expect(result.message).toContain("Network connection failed");
      expect(result.isRetryable).toBe(true);
      expect(result.suggestions[0].action).toBe("Check internet connection");
    });

    it("should handle timeout errors", () => {
      const mockError = {
        code: "ECONNABORTED",
        message: "timeout of 10000ms exceeded",
      };

      const result = ErrorHandler.handleNetworkError(mockError, mockContext);

      expect(result.type).toBe(ErrorType.NETWORK);
      expect(result.message).toContain("Request timed out");
      expect(result.isRetryable).toBe(true);
    });

    it("should handle server errors", () => {
      const mockError = {
        response: {
          status: 500,
          statusText: "Internal Server Error",
        },
      };

      const result = ErrorHandler.handleNetworkError(mockError, mockContext);

      expect(result.type).toBe(ErrorType.NETWORK);
      expect(result.message).toContain("GitHub server error (500)");
      expect(result.isRetryable).toBe(true);
    });
  });

  describe("handleRateLimitError", () => {
    it("should handle rate limit with reset time", () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const mockError = {
        response: {
          headers: {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": futureTime.toString(),
          },
        },
      };

      const result = ErrorHandler.handleRateLimitError(mockError, mockContext);

      expect(result.type).toBe(ErrorType.RATE_LIMIT);
      expect(result.message).toContain("rate limit exceeded");
      expect(result.message).toContain("minutes");
      expect(result.isRetryable).toBe(true);
    });

    it("should handle rate limit without reset time", () => {
      const mockError = {
        response: {
          headers: {
            "x-ratelimit-remaining": "5",
          },
        },
      };

      const result = ErrorHandler.handleRateLimitError(mockError, mockContext);

      expect(result.type).toBe(ErrorType.RATE_LIMIT);
      expect(result.message).toContain("rate limit exceeded");
      expect(result.isRetryable).toBe(true);
    });
  });

  describe("handleRepositoryError", () => {
    it("should handle 404 repository not found", () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Not Found" },
        },
      };

      const result = ErrorHandler.handleRepositoryError(mockError, mockContext);

      expect(result.type).toBe(ErrorType.REPOSITORY_ACCESS);
      expect(result.message).toContain("Repository not found");
      expect(result.suggestions[0].action).toBe("Check repository name");
    });

    it("should handle 403 access denied", () => {
      const mockError = {
        response: {
          status: 403,
          data: { message: "Forbidden" },
        },
      };

      const result = ErrorHandler.handleRepositoryError(mockError, mockContext);

      expect(result.type).toBe(ErrorType.REPOSITORY_ACCESS);
      expect(result.message).toContain("Access denied");
      expect(result.suggestions).toContainEqual(
        expect.objectContaining({
          action: "Check repository permissions",
          priority: "high",
        })
      );
    });
  });

  describe("handleValidationError", () => {
    it("should create validation error with suggestions", () => {
      const message = "Invalid input format";
      const suggestions = [
        {
          action: "Check format",
          description: "Use correct format",
          priority: "high" as const,
        },
      ];

      const result = ErrorHandler.handleValidationError(
        message,
        mockContext,
        suggestions
      );

      expect(result.type).toBe(ErrorType.VALIDATION);
      expect(result.message).toBe(message);
      expect(result.suggestions).toEqual(suggestions);
      expect(result.isRetryable).toBe(false);
    });
  });

  describe("handleParsingError", () => {
    it("should handle parsing errors with issue context", () => {
      const mockError = new Error("Invalid JSON");
      const contextWithIssue = { ...mockContext, issueId: 123 };

      const result = ErrorHandler.handleParsingError(
        mockError,
        contextWithIssue
      );

      expect(result.type).toBe(ErrorType.PARSING);
      expect(result.message).toContain("Failed to parse issue data");
      expect(result.suggestions).toContainEqual(
        expect.objectContaining({
          action: "Check issue manually",
          description: "Review issue #123 manually at GitHub",
        })
      );
    });
  });

  describe("handleEmptyResults", () => {
    it("should provide helpful suggestions for empty results", () => {
      const result = ErrorHandler.handleEmptyResults(mockContext);

      expect(result.type).toBe(ErrorType.EMPTY_RESULTS);
      expect(result.message).toContain("No relevant issues found");
      expect(result.suggestions).toContainEqual(
        expect.objectContaining({
          action: "Broaden search terms",
          priority: "high",
        })
      );
      expect(result.suggestions).toContainEqual(
        expect.objectContaining({
          action: "Lower relevance threshold",
          priority: "high",
        })
      );
    });
  });

  describe("handleFileSystemError", () => {
    it("should handle ENOENT errors", () => {
      const mockError = {
        code: "ENOENT",
        message: "no such file or directory",
      };
      const contextWithFile = { ...mockContext, filePath: "/path/to/file" };

      const result = ErrorHandler.handleFileSystemError(
        mockError,
        contextWithFile
      );

      expect(result.type).toBe(ErrorType.FILE_SYSTEM);
      expect(result.message).toContain("File or directory not found");
      expect(result.suggestions[0].action).toBe("Check file path");
    });

    it("should handle permission errors", () => {
      const mockError = {
        code: "EACCES",
        message: "permission denied",
      };
      const contextWithFile = { ...mockContext, filePath: "/path/to/file" };

      const result = ErrorHandler.handleFileSystemError(
        mockError,
        contextWithFile
      );

      expect(result.type).toBe(ErrorType.FILE_SYSTEM);
      expect(result.message).toContain("Permission denied");
      expect(result.suggestions[0].action).toBe("Check file permissions");
    });

    it("should handle disk space errors", () => {
      const mockError = {
        code: "ENOSPC",
        message: "no space left on device",
      };
      const contextWithFile = { ...mockContext, filePath: "/path/to/file" };

      const result = ErrorHandler.handleFileSystemError(
        mockError,
        contextWithFile
      );

      expect(result.type).toBe(ErrorType.FILE_SYSTEM);
      expect(result.message).toContain("Insufficient disk space");
      expect(result.suggestions[0].action).toBe("Free up disk space");
    });
  });

  describe("convertToScraperError", () => {
    it("should return ScraperError as-is", () => {
      const scraperError = new ScraperError(
        ErrorType.VALIDATION,
        "Test error",
        mockContext
      );

      const result = ErrorHandler.convertToScraperError(
        scraperError,
        mockContext
      );

      expect(result).toBe(scraperError);
    });

    it("should convert axios 401 error", () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 401,
          data: { message: "Unauthorized" },
        },
      };

      const result = ErrorHandler.convertToScraperError(
        axiosError,
        mockContext
      );

      expect(result.type).toBe(ErrorType.AUTHENTICATION);
    });

    it("should convert file system error", () => {
      const fsError = {
        code: "ENOENT",
        message: "File not found",
      };

      const result = ErrorHandler.convertToScraperError(fsError, mockContext);

      expect(result.type).toBe(ErrorType.FILE_SYSTEM);
    });

    it("should convert unknown error", () => {
      const unknownError = new Error("Something went wrong");

      const result = ErrorHandler.convertToScraperError(
        unknownError,
        mockContext
      );

      expect(result.type).toBe(ErrorType.UNKNOWN);
      expect(result.message).toContain("Unexpected error");
    });
  });

  describe("executeWithRetry", () => {
    it("should succeed on first attempt", async () => {
      const operation = jest.fn().mockResolvedValue("success");

      const result = await ErrorHandler.executeWithRetry(
        operation,
        mockContext
      );

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should retry retryable errors", async () => {
      const retryableError = new ScraperError(
        ErrorType.NETWORK,
        "Network error",
        mockContext,
        [],
        true // isRetryable
      );

      const operation = jest
        .fn()
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValue("success");

      const result = await ErrorHandler.executeWithRetry(
        operation,
        mockContext
      );

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it("should not retry non-retryable errors", async () => {
      const nonRetryableError = new ScraperError(
        ErrorType.AUTHENTICATION,
        "Auth error",
        mockContext,
        [],
        false // isRetryable
      );

      const operation = jest.fn().mockRejectedValue(nonRetryableError);

      await expect(
        ErrorHandler.executeWithRetry(operation, mockContext)
      ).rejects.toThrow(nonRetryableError);

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should stop retrying after max attempts", async () => {
      const retryableError = new ScraperError(
        ErrorType.NETWORK,
        "Network error",
        mockContext,
        [],
        true
      );

      const operation = jest.fn().mockRejectedValue(retryableError);

      await expect(
        ErrorHandler.executeWithRetry(operation, mockContext, 2)
      ).rejects.toThrow(retryableError);

      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe("formatError", () => {
    it("should format error with context", () => {
      const error = new ScraperError(
        ErrorType.AUTHENTICATION,
        "Auth failed",
        mockContext,
        [
          {
            action: "Check token",
            description: "Verify your token",
            priority: "high",
          },
          {
            action: "Try again",
            description: "Retry the operation",
            priority: "low",
          },
        ]
      );

      const formatted = ErrorHandler.formatError(error, true);

      expect(formatted).toContain("❌ Auth failed");
      expect(formatted).toContain("📍 Context: test operation");
      expect(formatted).toContain("💡 Suggestions:");
      expect(formatted).toContain("🔥 Check token: Verify your token");
      expect(formatted).toContain("ℹ️ Try again: Retry the operation");
    });

    it("should format error without context", () => {
      const error = new ScraperError(
        ErrorType.VALIDATION,
        "Validation failed",
        mockContext
      );

      const formatted = ErrorHandler.formatError(error, false);

      expect(formatted).toContain("❌ Validation failed");
      expect(formatted).not.toContain("📍 Context:");
    });

    it("should sort suggestions by priority", () => {
      const error = new ScraperError(
        ErrorType.NETWORK,
        "Network error",
        mockContext,
        [
          {
            action: "Low priority",
            description: "Low priority action",
            priority: "low",
          },
          {
            action: "High priority",
            description: "High priority action",
            priority: "high",
          },
          {
            action: "Medium priority",
            description: "Medium priority action",
            priority: "medium",
          },
        ]
      );

      const formatted = ErrorHandler.formatError(error, true);
      const lines = formatted.split("\n");
      const suggestionLines = lines.filter((line) => line.includes("priority"));

      expect(suggestionLines[0]).toContain("High priority");
      expect(suggestionLines[1]).toContain("Medium priority");
      expect(suggestionLines[2]).toContain("Low priority");
    });

    it("should handle empty suggestions gracefully", () => {
      const error = new ScraperError(
        ErrorType.UNKNOWN,
        "Unknown error",
        mockContext,
        []
      );

      const formatted = ErrorHandler.formatError(error, true);

      expect(formatted).toContain("❌ Unknown error");
      expect(formatted).not.toContain("💡 Suggestions:");
    });

    it("should handle very long error messages", () => {
      const longMessage = "A".repeat(1000);
      const error = new ScraperError(
        ErrorType.VALIDATION,
        longMessage,
        mockContext
      );

      const formatted = ErrorHandler.formatError(error, false);

      expect(formatted).toContain("❌");
      expect(formatted.length).toBeGreaterThan(1000);
    });
  });

  describe("edge cases and error recovery", () => {
    it("should handle malformed axios errors", () => {
      const malformedError = {
        isAxiosError: true,
        response: null, // Missing response
        message: "Network Error",
      };

      const result = ErrorHandler.convertToScraperError(
        malformedError,
        mockContext
      );

      expect(result.type).toBe(ErrorType.NETWORK);
      expect(result.message).toContain("Network Error");
    });

    it("should handle errors with circular references", () => {
      const circularError: any = { message: "Circular error" };
      circularError.self = circularError; // Create circular reference

      const result = ErrorHandler.convertToScraperError(
        circularError,
        mockContext
      );

      expect(result.type).toBe(ErrorType.UNKNOWN);
      expect(result.message).toContain("Circular error");
    });

    it("should handle null and undefined errors", () => {
      const nullResult = ErrorHandler.convertToScraperError(null, mockContext);
      const undefinedResult = ErrorHandler.convertToScraperError(
        undefined,
        mockContext
      );

      expect(nullResult.type).toBe(ErrorType.UNKNOWN);
      expect(undefinedResult.type).toBe(ErrorType.UNKNOWN);
    });

    it("should handle errors without message property", () => {
      const errorWithoutMessage = { code: "CUSTOM_ERROR" };

      const result = ErrorHandler.convertToScraperError(
        errorWithoutMessage,
        mockContext
      );

      expect(result.type).toBe(ErrorType.UNKNOWN);
      expect(result.message).toContain("Unknown error occurred");
    });

    it("should handle context with missing operation", () => {
      const contextWithoutOperation = {
        repository: "owner/repo",
        productArea: "test area",
      } as ErrorContext;

      const result = ErrorHandler.handleValidationError(
        "Test error",
        contextWithoutOperation
      );

      expect(result.context.operation).toBeUndefined();
      expect(result.message).toBe("Test error");
    });

    it("should handle very large suggestion arrays", () => {
      const manySuggestions = Array.from({ length: 100 }, (_, i) => ({
        action: `Action ${i}`,
        description: `Description ${i}`,
        priority: "medium" as const,
      }));

      const error = new ScraperError(
        ErrorType.VALIDATION,
        "Many suggestions",
        mockContext,
        manySuggestions
      );

      const formatted = ErrorHandler.formatError(error, true);

      expect(formatted).toContain("💡 Suggestions:");
      expect(formatted.split("\n").length).toBeGreaterThan(50);
    });
  });
});
